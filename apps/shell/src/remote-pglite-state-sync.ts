import { existsSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  buildSshRemoteStateProcessArgs,
  SshRemoteStateLifecycle,
  type SshRemoteStateTarget,
} from "@appaloft/adapter-cli";
import { type AppConfig, resolveConfig } from "@appaloft/config";
import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";

export interface RemotePgliteStateSyncPlan {
  dataRoot: string;
  localDataRoot: string;
  localPgliteDataDir: string;
  target: SshRemoteStateTarget;
}

export interface RemotePgliteStateSyncSession extends RemotePgliteStateSyncPlan {
  releaseForCliRuntime(): Promise<Result<void>>;
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

export interface PrepareRemotePgliteStateSyncInput {
  argv: readonly string[];
  env?: NodeJS.ProcessEnv;
  config?: AppConfig;
  runner?: RemotePgliteArchiveRunner;
}

const explicitLocalStateBackends = new Set(["local-pglite", "postgres-control-plane"]);

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

function remoteArchiveCommand(dataRoot: string): string {
  return [
    `mkdir -p ${shellQuote(dataRoot)}/pglite ${shellQuote(dataRoot)}/source-links ${shellQuote(dataRoot)}/server-applied-routes`,
    `cd ${shellQuote(dataRoot)}`,
    "tar -czf - pglite source-links server-applied-routes",
  ].join(" && ");
}

function remoteExtractCommand(dataRoot: string): string {
  const quotedDataRoot = shellQuote(dataRoot);

  return [
    `data_root=${quotedDataRoot}`,
    'backup_dir="$data_root/backups/sync-$(date +%Y%m%d%H%M%S)-$$"',
    'incoming_dir="$data_root/.incoming-sync-$$"',
    'recovery_file="$data_root/recovery/remote-sync-upload.json"',
    'restore_backup() { rm -rf "$data_root/pglite" "$data_root/source-links" "$data_root/server-applied-routes"; [ ! -d "$backup_dir/pglite" ] || cp -a "$backup_dir/pglite" "$data_root/pglite"; [ ! -d "$backup_dir/source-links" ] || cp -a "$backup_dir/source-links" "$data_root/source-links"; [ ! -d "$backup_dir/server-applied-routes" ] || cp -a "$backup_dir/server-applied-routes" "$data_root/server-applied-routes"; }',
    'write_recovery() { printf \'{"phase":"remote-state-sync-upload","backup":"%s"}\\n\' "$backup_dir" > "$recovery_file"; }',
    'mkdir -p "$data_root" "$data_root/backups" "$data_root/recovery"',
    'rm -rf "$incoming_dir"',
    'mkdir -p "$incoming_dir"',
    'if [ -d "$data_root/pglite" ] || [ -d "$data_root/source-links" ] || [ -d "$data_root/server-applied-routes" ]; then mkdir -p "$backup_dir"; [ ! -d "$data_root/pglite" ] || cp -a "$data_root/pglite" "$backup_dir/pglite"; [ ! -d "$data_root/source-links" ] || cp -a "$data_root/source-links" "$backup_dir/source-links"; [ ! -d "$data_root/server-applied-routes" ] || cp -a "$data_root/server-applied-routes" "$backup_dir/server-applied-routes"; fi',
    'if tar -xzf - -C "$incoming_dir" && [ -d "$incoming_dir/pglite" ] && [ -d "$incoming_dir/source-links" ] && [ -d "$incoming_dir/server-applied-routes" ] && rm -rf "$data_root/pglite" "$data_root/source-links" "$data_root/server-applied-routes" && mv "$incoming_dir/pglite" "$data_root/pglite" && mv "$incoming_dir/source-links" "$data_root/source-links" && mv "$incoming_dir/server-applied-routes" "$data_root/server-applied-routes"; then rm -rf "$incoming_dir"; else status=$?; rm -rf "$incoming_dir"; restore_backup; write_recovery; exit "$status"; fi',
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
    const previousRoot = localTransactionRoot(this.plan.localDataRoot, "previous");
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
    await rm(previousRoot, { recursive: true, force: true });
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
      if (existsSync(this.plan.localDataRoot)) {
        await rename(this.plan.localDataRoot, previousRoot);
      }
      await rename(stagingRoot, this.plan.localDataRoot);
      await rm(previousRoot, { recursive: true, force: true });
      return ok(undefined);
    } catch (error) {
      await rm(stagingRoot, { recursive: true, force: true });
      if (!existsSync(this.plan.localDataRoot) && existsSync(previousRoot)) {
        await rename(previousRoot, this.plan.localDataRoot);
      }
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

  async syncToRemote(): Promise<Result<void>> {
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
        remoteExtractCommand(this.plan.dataRoot),
      ],
      stdin: archive.stdout,
      redactions: this.plan.target.identityFile ? [this.plan.target.identityFile] : [],
    });
    if (remoteExtract.failed) {
      return err(
        domainError.infra(
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

  const lifecycle = new SshRemoteStateLifecycle({
    target: plan.value.target,
    dataRoot: plan.value.dataRoot,
    owner: "appaloft-cli",
    correlationId: "remote_state_shell",
  });
  const prepared = await lifecycle.prepare();
  if (prepared.isErr()) {
    return err(prepared.error);
  }

  const archiveSync = new RemotePgliteArchiveSync(plan.value, input.runner);
  const downloaded = await archiveSync.syncFromRemote();
  if (downloaded.isErr()) {
    const released = await prepared.value.release();
    if (released.isErr()) {
      return err(released.error);
    }
    return err(downloaded.error);
  }

  return ok({
    ...plan.value,
    releaseForCliRuntime: async () => ok(undefined),
    syncBackAndRelease: async () => {
      let firstError: DomainError | null = null;
      const uploaded = await archiveSync.syncToRemote();
      if (uploaded.isErr()) {
        firstError = uploaded.error;
      }

      const released = await prepared.value.release();
      if (released.isErr()) {
        return err(firstError ?? released.error);
      }

      return firstError ? err(firstError) : ok(undefined);
    },
  });
}
