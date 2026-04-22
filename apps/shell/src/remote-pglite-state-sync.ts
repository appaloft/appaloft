import { existsSync } from "node:fs";
import { cp, mkdir, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  buildSshRemoteStateProcessArgs,
  SshRemoteStateLifecycle,
  type SshRemoteStateTarget,
} from "@appaloft/adapter-cli";
import { type AppConfig, resolveConfig } from "@appaloft/config";
import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";
import { mergeRemotePgliteState } from "./pglite-remote-state-merge";

export interface RemotePgliteStateSyncPlan {
  dataRoot: string;
  localDataRoot: string;
  localPgliteDataDir: string;
  target: SshRemoteStateTarget;
}

export interface RemotePgliteStateSyncSession extends RemotePgliteStateSyncPlan {
  releaseForCliRuntime(): Promise<Result<void>>;
  refreshLocalMirror(): Promise<Result<void>>;
  syncBackAndRelease(): Promise<Result<void>>;
}

export interface RemotePgliteArchiveRunnerInput {
  command: string;
  args: string[];
  stdin?: Uint8Array;
  redactions?: readonly string[];
}

export interface RemotePgliteArchiveRunnerResult {
  exitCode: number;
  stdout: Uint8Array;
  stderr: string;
  failed: boolean;
}

export interface RemotePgliteArchiveRunner {
  run(input: RemotePgliteArchiveRunnerInput): RemotePgliteArchiveRunnerResult;
}

interface LifecycleRunnerInput {
  target: SshRemoteStateTarget;
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  redactions?: readonly string[];
}

interface LifecycleRunnerResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  failed: boolean;
}

interface LifecycleRunner {
  run(input: LifecycleRunnerInput): Promise<LifecycleRunnerResult> | LifecycleRunnerResult;
}

export interface PrepareRemotePgliteStateSyncInput {
  argv: readonly string[];
  env?: NodeJS.ProcessEnv;
  config?: AppConfig;
  runner?: RemotePgliteArchiveRunner;
}

const explicitLocalStateBackends = new Set(["local-pglite", "postgres-control-plane"]);
const remoteStateRevisionConflictExitCode = 76;

function shellQuote(input: string): string {
  return `'${input.replaceAll("'", "'\\''")}'`;
}

function readOption(argv: readonly string[], name: string): string | undefined {
  const prefix = `${name}=`;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === name) {
      return argv[index + 1];
    }

    if (value?.startsWith(prefix)) {
      return value.slice(prefix.length);
    }
  }

  return undefined;
}

function hasDeployCommand(argv: readonly string[]): boolean {
  return argv.includes("deploy");
}

function hasSourceLinkRelinkCommand(argv: readonly string[]): boolean {
  const sourceLinksIndex = argv.indexOf("source-links");
  if (sourceLinksIndex === -1) {
    return false;
  }

  return argv[sourceLinksIndex + 1] === "relink";
}

function hasPreviewCleanupCommand(argv: readonly string[]): boolean {
  const previewIndex = argv.indexOf("preview");
  if (previewIndex === -1) {
    return false;
  }

  return argv[previewIndex + 1] === "cleanup";
}

function requiresRemotePgliteStateCommand(argv: readonly string[]): boolean {
  return (
    hasDeployCommand(argv) || hasSourceLinkRelinkCommand(argv) || hasPreviewCleanupCommand(argv)
  );
}

function normalizePort(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function safeTargetKey(target: SshRemoteStateTarget): string {
  return [target.username ?? "ssh", target.host, String(target.port ?? 22)]
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function errorDetails(input: {
  phase: string;
  target: SshRemoteStateTarget;
  exitCode?: number;
  stderr?: string;
}): Record<string, string | number | boolean | null> {
  return {
    phase: input.phase,
    stateBackend: "ssh-pglite",
    host: input.target.host,
    port: String(input.target.port ?? 22),
    ...(input.exitCode === undefined ? {} : { exitCode: input.exitCode }),
    ...(input.stderr?.trim() ? { stderr: input.stderr.trim().slice(0, 2_000) } : {}),
  };
}

function parseRemoteRevision(value: string): number | null {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  const parsed = Number(trimmedValue);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parseRemoteRevisionConflict(
  stderr: string,
): { expectedRevision?: number; actualRevision?: number } | null {
  const trimmedValue = stderr.trim();
  if (!trimmedValue.startsWith("{")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmedValue) as {
      expectedRevision?: unknown;
      actualRevision?: unknown;
    };

    return {
      ...(typeof parsed.expectedRevision === "number"
        ? { expectedRevision: parsed.expectedRevision }
        : {}),
      ...(typeof parsed.actualRevision === "number"
        ? { actualRevision: parsed.actualRevision }
        : {}),
    };
  } catch {
    return null;
  }
}

function remoteArchiveCommand(dataRoot: string): string {
  return [
    `mkdir -p ${shellQuote(dataRoot)}/pglite ${shellQuote(dataRoot)}/source-links ${shellQuote(dataRoot)}/server-applied-routes`,
    `cd ${shellQuote(dataRoot)}`,
    "tar -czf - pglite source-links server-applied-routes",
  ].join(" && ");
}

function remoteRevisionReadCommand(dataRoot: string): string {
  const quotedDataRoot = shellQuote(dataRoot);

  return [
    `data_root=${quotedDataRoot}`,
    'revision_file="$data_root/sync-revision.txt"',
    'mkdir -p "$data_root"',
    'if [ -f "$revision_file" ]; then cat "$revision_file"; else printf "0\\n"; fi',
  ].join("; ");
}

function remoteExtractCommand(input: {
  dataRoot: string;
  expectedRevision: number;
  nextRevision: number;
}): string {
  const quotedDataRoot = shellQuote(input.dataRoot);

  return [
    `data_root=${quotedDataRoot}`,
    `expected_revision=${shellQuote(String(input.expectedRevision))}`,
    `next_revision=${shellQuote(String(input.nextRevision))}`,
    'backup_dir="$data_root/backups/sync-$(date +%Y%m%d%H%M%S)-$$"',
    'incoming_dir="$data_root/.incoming-sync-$$"',
    'recovery_file="$data_root/recovery/remote-sync-upload.json"',
    'revision_file="$data_root/sync-revision.txt"',
    'restore_backup() { rm -rf "$data_root/pglite" "$data_root/source-links" "$data_root/server-applied-routes"; [ ! -d "$backup_dir/pglite" ] || cp -a "$backup_dir/pglite" "$data_root/pglite"; [ ! -d "$backup_dir/source-links" ] || cp -a "$backup_dir/source-links" "$data_root/source-links"; [ ! -d "$backup_dir/server-applied-routes" ] || cp -a "$backup_dir/server-applied-routes" "$data_root/server-applied-routes"; }',
    'write_recovery() { printf \'{"phase":"remote-state-sync-upload","backup":"%s"}\\n\' "$backup_dir" > "$recovery_file"; }',
    'mkdir -p "$data_root" "$data_root/backups" "$data_root/recovery"',
    "current_revision=0",
    'if [ -f "$revision_file" ]; then current_revision="$(cat "$revision_file" 2>/dev/null || printf "0")"; fi',
    '[ -n "$current_revision" ] || current_revision=0',
    'if [ "$current_revision" != "$expected_revision" ]; then printf \'{"phase":"remote-state-sync-upload","reason":"remote_state_revision_conflict","expectedRevision":%s,"actualRevision":%s}\\n\' "$expected_revision" "$current_revision" >&2; exit 76; fi',
    'rm -rf "$incoming_dir"',
    'mkdir -p "$incoming_dir"',
    'if [ -d "$data_root/pglite" ] || [ -d "$data_root/source-links" ] || [ -d "$data_root/server-applied-routes" ]; then mkdir -p "$backup_dir"; [ ! -d "$data_root/pglite" ] || cp -a "$data_root/pglite" "$backup_dir/pglite"; [ ! -d "$data_root/source-links" ] || cp -a "$data_root/source-links" "$backup_dir/source-links"; [ ! -d "$data_root/server-applied-routes" ] || cp -a "$data_root/server-applied-routes" "$backup_dir/server-applied-routes"; fi',
    'if tar -xzf - -C "$incoming_dir" && [ -d "$incoming_dir/pglite" ] && [ -d "$incoming_dir/source-links" ] && [ -d "$incoming_dir/server-applied-routes" ] && rm -rf "$data_root/pglite" "$data_root/source-links" "$data_root/server-applied-routes" && mv "$incoming_dir/pglite" "$data_root/pglite" && mv "$incoming_dir/source-links" "$data_root/source-links" && mv "$incoming_dir/server-applied-routes" "$data_root/server-applied-routes" && printf "%s\\n" "$next_revision" > "$revision_file"; then rm -rf "$incoming_dir"; else status=$?; rm -rf "$incoming_dir"; restore_backup; write_recovery; exit "$status"; fi',
  ].join("; ");
}

function defaultRunner(): RemotePgliteArchiveRunner {
  return {
    run(input) {
      const result = Bun.spawnSync([input.command, ...input.args], {
        ...(input.stdin ? { stdin: input.stdin } : {}),
        stdout: "pipe",
        stderr: "pipe",
      });
      const stderr = result.stderr.toString();
      const redactedStderr = (input.redactions ?? []).reduce(
        (value, secret) => (secret.length > 0 ? value.replaceAll(secret, "[redacted]") : value),
        stderr,
      );

      return {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: redactedStderr,
        failed: !result.success,
      };
    },
  };
}

function localTransactionRoot(localDataRoot: string, label: string): string {
  return `${localDataRoot}.${label}-${process.pid}-${Date.now()}`;
}

async function replaceLocalMirror(input: {
  sourceRoot: string;
  targetRoot: string;
}): Promise<void> {
  const previousRoot = localTransactionRoot(input.targetRoot, "previous");

  await rm(previousRoot, { recursive: true, force: true });
  try {
    if (existsSync(input.targetRoot)) {
      await rename(input.targetRoot, previousRoot);
    }
    await rename(input.sourceRoot, input.targetRoot);
    await rm(previousRoot, { recursive: true, force: true });
  } catch (error) {
    await rm(input.sourceRoot, { recursive: true, force: true });
    if (!existsSync(input.targetRoot) && existsSync(previousRoot)) {
      await rename(previousRoot, input.targetRoot);
    }
    throw error;
  }
}

async function snapshotLocalMirror(input: {
  sourceRoot: string;
  snapshotRoot: string;
}): Promise<void> {
  await rm(input.snapshotRoot, { recursive: true, force: true });
  await mkdir(input.snapshotRoot, { recursive: true });

  for (const entry of ["pglite", "source-links", "server-applied-routes"] as const) {
    const sourcePath = join(input.sourceRoot, entry);
    const targetPath = join(input.snapshotRoot, entry);

    if (!existsSync(sourcePath)) {
      await mkdir(targetPath, { recursive: true });
      continue;
    }

    await cp(sourcePath, targetPath, { recursive: true });
  }
}

function lifecycleRunnerFromArchiveRunner(runner: RemotePgliteArchiveRunner): LifecycleRunner {
  const textDecoder = new TextDecoder();

  return {
    run(input: LifecycleRunnerInput): LifecycleRunnerResult {
      void input.cwd;
      void input.env;
      const result = runner.run({
        command: "ssh",
        args: [...buildSshRemoteStateProcessArgs(input.target), input.command],
        ...(input.redactions ? { redactions: input.redactions } : {}),
      });

      return {
        exitCode: result.exitCode,
        stdout: textDecoder.decode(result.stdout),
        stderr: result.stderr,
        failed: result.failed,
      };
    },
  };
}

export function resolveRemotePgliteStateSyncPlan(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
  config: AppConfig = resolveConfig({ env }),
): Result<RemotePgliteStateSyncPlan | null> {
  if (!requiresRemotePgliteStateCommand(argv)) {
    return ok(null);
  }

  const stateBackend = readOption(argv, "--state-backend");
  if (stateBackend && explicitLocalStateBackends.has(stateBackend)) {
    return ok(null);
  }

  if (env.APPALOFT_DATABASE_URL || env.APPALOFT_CONTROL_PLANE_URL) {
    return ok(null);
  }

  const host = readOption(argv, "--server-host");
  if (!host) {
    if (stateBackend === "ssh-pglite") {
      return err(
        domainError.validation("SSH remote PGlite state requires --server-host", {
          phase: "remote-state-resolution",
          stateBackend: "ssh-pglite",
        }),
      );
    }

    return ok(null);
  }

  const port = normalizePort(readOption(argv, "--server-port"));
  const username = readOption(argv, "--server-ssh-username");
  const identityFile = readOption(argv, "--server-ssh-private-key-file");
  const target: SshRemoteStateTarget = {
    host,
    ...(port === undefined ? {} : { port }),
    ...(username ? { username } : {}),
    ...(identityFile ? { identityFile } : {}),
  };
  const dataRoot = `${config.remoteRuntimeRoot.replace(/\/+$/, "")}/state`;
  const localPgliteDataDir = resolve(
    env.APPALOFT_PGLITE_DATA_DIR ??
      join(config.dataDir, "remote-pglite", safeTargetKey(target), "pglite"),
  );
  const localDataRoot = dirname(localPgliteDataDir);

  return ok({
    dataRoot,
    localDataRoot,
    localPgliteDataDir,
    target,
  });
}

export class RemotePgliteArchiveSync {
  private readonly runner: RemotePgliteArchiveRunner;

  constructor(
    private readonly plan: RemotePgliteStateSyncPlan,
    runner?: RemotePgliteArchiveRunner,
  ) {
    this.runner = runner ?? defaultRunner();
  }

  async syncFromRemote(): Promise<Result<void>> {
    const stagingRoot = localTransactionRoot(this.plan.localDataRoot, "download");
    const remoteArchive = this.runner.run({
      command: "ssh",
      args: [
        ...buildSshRemoteStateProcessArgs(this.plan.target),
        remoteArchiveCommand(this.plan.dataRoot),
      ],
      redactions: this.plan.target.identityFile ? [this.plan.target.identityFile] : [],
    });
    if (remoteArchive.failed) {
      return err(
        domainError.infra(
          "SSH remote PGlite state could not be downloaded",
          errorDetails({
            phase: "remote-state-sync-download",
            target: this.plan.target,
            exitCode: remoteArchive.exitCode,
            stderr: remoteArchive.stderr,
          }),
        ),
      );
    }

    await rm(stagingRoot, { recursive: true, force: true });
    await mkdir(dirname(this.plan.localDataRoot), { recursive: true });
    await mkdir(stagingRoot, { recursive: true });

    const extract = this.runner.run({
      command: "tar",
      args: ["-xzf", "-", "-C", stagingRoot],
      stdin: remoteArchive.stdout,
    });
    if (extract.failed) {
      await rm(stagingRoot, { recursive: true, force: true });
      return err(
        domainError.infra(
          "SSH remote PGlite state archive could not be extracted",
          errorDetails({
            phase: "remote-state-sync-download",
            target: this.plan.target,
            exitCode: extract.exitCode,
            stderr: extract.stderr,
          }),
        ),
      );
    }

    try {
      await replaceLocalMirror({
        sourceRoot: stagingRoot,
        targetRoot: this.plan.localDataRoot,
      });
      return ok(undefined);
    } catch (error) {
      return err(
        domainError.infra("SSH remote PGlite local mirror could not be replaced", {
          ...errorDetails({
            phase: "remote-state-sync-download",
            target: this.plan.target,
          }),
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  async readRemoteRevision(): Promise<Result<number>> {
    const remoteRevision = this.runner.run({
      command: "ssh",
      args: [
        ...buildSshRemoteStateProcessArgs(this.plan.target),
        remoteRevisionReadCommand(this.plan.dataRoot),
      ],
      redactions: this.plan.target.identityFile ? [this.plan.target.identityFile] : [],
    });
    if (remoteRevision.failed) {
      return err(
        domainError.infra(
          "SSH remote PGlite state revision could not be read",
          errorDetails({
            phase: "remote-state-sync-download",
            target: this.plan.target,
            exitCode: remoteRevision.exitCode,
            stderr: remoteRevision.stderr,
          }),
        ),
      );
    }

    const parsedRevision = parseRemoteRevision(new TextDecoder().decode(remoteRevision.stdout));
    if (parsedRevision === null) {
      return err(
        domainError.infra("SSH remote PGlite state revision is invalid", {
          ...errorDetails({
            phase: "remote-state-sync-download",
            target: this.plan.target,
          }),
          revision: new TextDecoder().decode(remoteRevision.stdout).trim().slice(0, 128),
        }),
      );
    }

    return ok(parsedRevision);
  }

  async syncToRemote(input?: {
    expectedRevision: number;
    nextRevision: number;
  }): Promise<Result<void>> {
    const expectedRevision = input?.expectedRevision ?? 0;
    const nextRevision = input?.nextRevision ?? expectedRevision + 1;
    await mkdir(this.plan.localPgliteDataDir, { recursive: true });
    await mkdir(join(this.plan.localDataRoot, "source-links"), { recursive: true });
    await mkdir(join(this.plan.localDataRoot, "server-applied-routes"), { recursive: true });
    const archive = this.runner.run({
      command: "tar",
      args: [
        "-czf",
        "-",
        "-C",
        this.plan.localDataRoot,
        "pglite",
        "source-links",
        "server-applied-routes",
      ],
    });
    if (archive.failed) {
      return err(
        domainError.infra(
          "Local PGlite state archive could not be created",
          errorDetails({
            phase: "remote-state-sync-upload",
            target: this.plan.target,
            exitCode: archive.exitCode,
            stderr: archive.stderr,
          }),
        ),
      );
    }

    const remoteExtract = this.runner.run({
      command: "ssh",
      args: [
        ...buildSshRemoteStateProcessArgs(this.plan.target),
        remoteExtractCommand({
          dataRoot: this.plan.dataRoot,
          expectedRevision,
          nextRevision,
        }),
      ],
      stdin: archive.stdout,
      redactions: this.plan.target.identityFile ? [this.plan.target.identityFile] : [],
    });
    if (remoteExtract.failed) {
      const revisionConflict =
        remoteExtract.exitCode === remoteStateRevisionConflictExitCode
          ? parseRemoteRevisionConflict(remoteExtract.stderr)
          : null;
      return err(
        remoteExtract.exitCode === remoteStateRevisionConflictExitCode
          ? {
              code: "infra_error",
              category: "infra",
              message:
                "SSH remote PGlite state changed while the command was running; retry with a fresh remote snapshot",
              retryable: true,
              details: {
                ...errorDetails({
                  phase: "remote-state-sync-upload",
                  target: this.plan.target,
                  exitCode: remoteExtract.exitCode,
                  stderr: remoteExtract.stderr,
                }),
                reason: "remote_state_revision_conflict",
                ...(revisionConflict?.expectedRevision === undefined
                  ? {}
                  : { expectedRevision: revisionConflict.expectedRevision }),
                ...(revisionConflict?.actualRevision === undefined
                  ? {}
                  : { actualRevision: revisionConflict.actualRevision }),
              },
            }
          : domainError.infra(
              "SSH remote PGlite state could not be uploaded",
              errorDetails({
                phase: "remote-state-sync-upload",
                target: this.plan.target,
                exitCode: remoteExtract.exitCode,
                stderr: remoteExtract.stderr,
              }),
            ),
      );
    }

    return ok(undefined);
  }
}

export async function prepareRemotePgliteStateSync(
  input: PrepareRemotePgliteStateSyncInput,
): Promise<Result<RemotePgliteStateSyncSession | null>> {
  const plan = resolveRemotePgliteStateSyncPlan(input.argv, input.env ?? process.env, input.config);
  if (plan.isErr()) {
    return err(plan.error);
  }
  if (!plan.value) {
    return ok(null);
  }
  const planValue = plan.value;

  const lifecycleRunner = input.runner ? lifecycleRunnerFromArchiveRunner(input.runner) : undefined;
  const lifecycle = new SshRemoteStateLifecycle({
    target: planValue.target,
    dataRoot: planValue.dataRoot,
    owner: "appaloft-cli",
    correlationId: `remote_state_shell_${process.pid}_${Date.now().toString(36)}`,
    ...(lifecycleRunner ? { runner: lifecycleRunner } : {}),
  });
  const prepared = await lifecycle.prepare();
  if (prepared.isErr()) {
    return err(prepared.error);
  }

  const archiveSync = new RemotePgliteArchiveSync(planValue, input.runner);
  const downloaded = await archiveSync.syncFromRemote();
  if (downloaded.isErr()) {
    const released = await prepared.value.release();
    if (released.isErr()) {
      return err(released.error);
    }
    return err(downloaded.error);
  }

  const baseRevision = await archiveSync.readRemoteRevision();
  if (baseRevision.isErr()) {
    const released = await prepared.value.release();
    if (released.isErr()) {
      return err(released.error);
    }
    return err(baseRevision.error);
  }

  let activeLifecycleSession = prepared.value;
  let activeBaseRevision = baseRevision.value;
  let releasedForCliRuntime = false;
  const baseSnapshotRoot = localTransactionRoot(planValue.localDataRoot, "base");

  try {
    await snapshotLocalMirror({
      sourceRoot: planValue.localDataRoot,
      snapshotRoot: baseSnapshotRoot,
    });
  } catch (error) {
    const released = await prepared.value.release();
    if (released.isErr()) {
      return err(released.error);
    }
    return err(
      domainError.infra("SSH remote PGlite base snapshot could not be prepared", {
        ...errorDetails({
          phase: "remote-state-sync-download",
          target: planValue.target,
        }),
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }

  async function ensureReleased(): Promise<Result<void>> {
    if (releasedForCliRuntime) {
      return ok(undefined);
    }

    const released = await activeLifecycleSession.release();
    if (released.isErr()) {
      return err(released.error);
    }

    releasedForCliRuntime = true;
    return ok(undefined);
  }

  async function ensureLifecycleSession(): Promise<Result<void>> {
    if (!releasedForCliRuntime) {
      return ok(undefined);
    }

    const resumed = await new SshRemoteStateLifecycle({
      target: planValue.target,
      dataRoot: planValue.dataRoot,
      owner: "appaloft-cli",
      correlationId: `remote_state_shell_resume_${process.pid}_${Date.now().toString(36)}`,
      ...(lifecycleRunner ? { runner: lifecycleRunner } : {}),
    }).prepare();
    if (resumed.isErr()) {
      return err(resumed.error);
    }

    activeLifecycleSession = resumed.value;
    releasedForCliRuntime = false;
    return ok(undefined);
  }

  return ok({
    ...planValue,
    releaseForCliRuntime: async () => ensureReleased(),
    refreshLocalMirror: async () => {
      const resumed = await ensureLifecycleSession();
      if (resumed.isErr()) {
        return err(resumed.error);
      }

      const downloaded = await archiveSync.syncFromRemote();
      if (downloaded.isErr()) {
        const released = await activeLifecycleSession.release();
        if (released.isErr()) {
          return err(released.error);
        }
        releasedForCliRuntime = true;
        return err(downloaded.error);
      }

      const refreshedRevision = await archiveSync.readRemoteRevision();
      if (refreshedRevision.isErr()) {
        const released = await activeLifecycleSession.release();
        if (released.isErr()) {
          return err(released.error);
        }
        releasedForCliRuntime = true;
        return err(refreshedRevision.error);
      }

      activeBaseRevision = refreshedRevision.value;
      try {
        await snapshotLocalMirror({
          sourceRoot: planValue.localDataRoot,
          snapshotRoot: baseSnapshotRoot,
        });
      } catch (error) {
        const released = await activeLifecycleSession.release();
        if (released.isErr()) {
          return err(released.error);
        }
        releasedForCliRuntime = true;
        return err(
          domainError.infra("SSH remote PGlite base snapshot could not be refreshed", {
            ...errorDetails({
              phase: "remote-state-sync-download",
              target: planValue.target,
            }),
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      }

      const released = await ensureReleased();
      if (released.isErr()) {
        return err(released.error);
      }

      return ok(undefined);
    },
    syncBackAndRelease: async () => {
      let firstError: DomainError | null = null;
      const mergedLocalRoot = localTransactionRoot(planValue.localDataRoot, "merged");
      const resumed = await ensureLifecycleSession();
      if (resumed.isErr()) {
        return err(resumed.error);
      }

      let uploaded = await archiveSync.syncToRemote({
        expectedRevision: activeBaseRevision,
        nextRevision: activeBaseRevision + 1,
      });
      if (uploaded.isErr() && uploaded.error.details?.reason === "remote_state_revision_conflict") {
        const mergedArchiveSync = new RemotePgliteArchiveSync(
          {
            ...planValue,
            localDataRoot: mergedLocalRoot,
            localPgliteDataDir: join(mergedLocalRoot, "pglite"),
          },
          input.runner,
        );
        const refreshedRemote = await mergedArchiveSync.syncFromRemote();
        if (refreshedRemote.isErr()) {
          firstError = refreshedRemote.error;
        } else {
          const refreshedRevision = await mergedArchiveSync.readRemoteRevision();
          if (refreshedRevision.isErr()) {
            firstError = refreshedRevision.error;
          } else {
            const merged = await mergeRemotePgliteState({
              baseDataRoot: baseSnapshotRoot,
              localDataRoot: planValue.localDataRoot,
              targetDataRoot: mergedLocalRoot,
            });
            if (merged.isErr()) {
              firstError = merged.error;
            } else {
              uploaded = await mergedArchiveSync.syncToRemote({
                expectedRevision: refreshedRevision.value,
                nextRevision: refreshedRevision.value + 1,
              });
              if (uploaded.isErr()) {
                firstError = uploaded.error;
              } else {
                activeBaseRevision = refreshedRevision.value + 1;
              }
            }
          }
        }
      } else if (uploaded.isErr()) {
        firstError = uploaded.error;
      } else {
        activeBaseRevision += 1;
      }

      const released = await activeLifecycleSession.release();
      if (released.isErr()) {
        return err(firstError ?? released.error);
      }
      releasedForCliRuntime = true;
      await rm(baseSnapshotRoot, { recursive: true, force: true });
      await rm(mergedLocalRoot, { recursive: true, force: true });

      return firstError ? err(firstError) : ok(undefined);
    },
  });
}
