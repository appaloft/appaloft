import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { renameSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { createDatabase, createMigrator } from "@appaloft/persistence-pg";
import {
  prepareRemotePgliteStateSync,
  type RemotePgliteArchiveRunnerInput,
  RemotePgliteArchiveSync,
  resolveRemotePgliteStateSyncPlan,
} from "../src/remote-pglite-state-sync";

function testConfig(
  dataDir: string,
  overrides?: {
    remoteRuntimeRoot?: string;
  },
) {
  return {
    appName: "Appaloft",
    appVersion: "0.1.0",
    runtimeMode: "self-hosted" as const,
    authProvider: "none" as const,
    betterAuthBaseUrl: "http://localhost:3001",
    betterAuthSecret: "test",
    httpHost: "127.0.0.1",
    httpPort: 3001,
    webOrigin: "http://localhost:4173",
    databaseDriver: "pglite" as const,
    autoMigrate: false,
    dataDir,
    pgliteDataDir: join(dataDir, "pglite"),
    remoteRuntimeRoot: overrides?.remoteRuntimeRoot ?? "/var/lib/appaloft/runtime",
    remotePgliteSyncBackupRetentionDays: 7,
    remotePgliteSyncBackupMaxCount: 20,
    logLevel: "info" as const,
    environment: "test",
    otelEnabled: false,
    otelServiceName: "appaloft-test",
    secretMask: "****",
    defaultAccessDomain: {
      mode: "disabled" as const,
      providerKey: "sslip",
      zone: "sslip.io",
      scheme: "http" as const,
    },
    certificateProvider: {
      mode: "disabled" as const,
      providerKey: "acme",
      acme: {
        directoryUrl: "https://example.test/acme",
        termsOfServiceAgreed: false,
        skipChallengeVerification: false,
        challengeTokenTtlSeconds: 600,
      },
    },
    certificateRetryScheduler: {
      enabled: false,
      intervalSeconds: 300,
      defaultRetryDelaySeconds: 300,
      batchSize: 25,
    },
    previewCleanupRetryScheduler: {
      enabled: false,
      intervalSeconds: 300,
      batchSize: 25,
    },
    previewExpiryCleanupScheduler: {
      enabled: false,
      intervalSeconds: 300,
      batchSize: 25,
    },
    dockerSwarmExecution: {
      enabled: false,
      commandTimeoutMs: 60000,
    },
    terminalSessions: {
      activeTtlSeconds: 3600,
      outputRetentionBytes: 65536,
    },
    scheduledTaskRunner: {
      enabled: false,
      intervalSeconds: 60,
      batchSize: 25,
    },
    scheduledRuntimePruneRunner: {
      enabled: false,
      intervalSeconds: 3600,
      batchSize: 25,
    },
    scheduledDependencyBackupRunner: {
      enabled: false,
      intervalSeconds: 3600,
      batchSize: 25,
    },
    scheduledStorageVolumeBackupRunner: {
      enabled: false,
      intervalSeconds: 300,
      batchSize: 25,
    },
    tunnelSessions: {
      reconcilerEnabled: false,
      reconcileIntervalSeconds: 60,
      reconcileBatchSize: 100,
      cloudflareExecutable: "cloudflared",
      ngrokExecutable: "ngrok",
    },
    scheduledHistoryRetentionRunner: {
      enabled: false,
      intervalSeconds: 3600,
      batchSize: 25,
    },
    runtimeMonitoringCollectorRunner: {
      enabled: false,
      intervalSeconds: 60,
      batchSize: 25,
      rawRetentionHours: 24,
    },
    workerRuntime: {
      mode: "embedded" as const,
      queueBackend: "database" as const,
      workerCount: 1,
      workerGroup: "appaloft-worker",
    },
    workerRuntimeObservedGroups: [],
    enabledSystemPlugins: [],
  };
}

async function initializePgliteRoot(root: string) {
  await mkdir(root, { recursive: true });
  await mkdir(join(root, "source-links"), { recursive: true });
  await mkdir(join(root, "server-applied-routes"), { recursive: true });

  const connection = await createDatabase({
    driver: "pglite",
    pgliteDataDir: join(root, "pglite"),
  });
  const migrations = await createMigrator(connection.db).migrateToLatest();
  if (migrations.error) {
    await connection.close();
    throw migrations.error;
  }

  return connection;
}

function createLocalSshArchiveRunner() {
  return {
    run(input: RemotePgliteArchiveRunnerInput) {
      const remoteCommand = input.args[input.args.length - 1] ?? "";
      const executableRemoteCommand =
        process.platform === "darwin"
          ? remoteCommand
              .replaceAll("command -v flock >/dev/null 2>&1", "true")
              .replaceAll("flock -w 5 9", "true")
              .replaceAll("flock -u 9", "true")
          : remoteCommand;
      const command =
        input.command === "ssh"
          ? ["sh", "-lc", executableRemoteCommand]
          : [input.command, ...input.args];
      const result = Bun.spawnSync(command, {
        ...(input.stdin ? { stdin: input.stdin } : {}),
        stdout: "pipe",
        stderr: "pipe",
      });

      return {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr.toString(),
        failed: !result.success,
      };
    },
  };
}

function isRemoteMutationLockRelease(input: RemotePgliteArchiveRunnerInput) {
  if (input.command !== "ssh") return false;
  const command = input.args.join(" ");
  return command.includes("released %s") && command.includes("released_owner");
}

describe("remote PGlite state sync", () => {
  test("[CPS-REMOTE-015] SSH mirror download streams the archive to a private file", async () => {
    const localDataRoot = await mkdtemp(join(tmpdir(), "appaloft-stream-download-local-"));
    const remoteRuntimeRoot = await mkdtemp(join(tmpdir(), "appaloft-stream-download-remote-"));
    const remoteStateRoot = join(remoteRuntimeRoot, "state");
    let streamedArchivePath: string | undefined;
    let streamedArchiveMode: number | undefined;
    let streamedRemoteCommand: string | undefined;

    try {
      await mkdir(join(remoteStateRoot, "pglite"), { recursive: true });
      await mkdir(join(remoteStateRoot, "source-links"), { recursive: true });
      await mkdir(join(remoteStateRoot, "server-applied-routes"), { recursive: true });
      await writeFile(join(remoteStateRoot, "pglite", "live.txt"), "remote-live-state");

      const baseRunner = createLocalSshArchiveRunner();
      const runner = {
        run(input: RemotePgliteArchiveRunnerInput) {
          if (input.command === "ssh" && input.args.at(-1)?.includes("tar -czf -")) {
            throw new Error("download archive must not use an in-memory stdout buffer");
          }
          return baseRunner.run(input);
        },
        async runToFile(input: RemotePgliteArchiveRunnerInput, outputPath: string) {
          streamedArchivePath = outputPath;
          streamedArchiveMode = (await stat(outputPath)).mode & 0o777;
          streamedRemoteCommand = input.args.at(-1);
          const command = ["sh", "-lc", input.args.at(-1) ?? ""];
          const process = Bun.spawn(command, {
            stdout: Bun.file(outputPath),
            stderr: "pipe",
          });
          const exitCode = await process.exited;
          return {
            exitCode,
            stdout: new Uint8Array(),
            stderr: await new Response(process.stderr).text(),
            failed: exitCode !== 0,
          };
        },
      };
      const sync = new RemotePgliteArchiveSync(
        {
          dataRoot: remoteStateRoot,
          localDataRoot,
          localPgliteDataDir: join(localDataRoot, "pglite"),
          backupRetentionDays: 7,
          backupMaxCount: 20,
          target: { host: "127.0.0.1" },
          readOnly: true,
        },
        runner,
      );

      const result = await sync.syncFromRemote();

      expect(result.isOk()).toBe(true);
      expect(await readFile(join(localDataRoot, "pglite", "live.txt"), "utf8")).toBe(
        "remote-live-state",
      );
      expect(streamedArchivePath).toBeDefined();
      expect(streamedArchiveMode).toBe(0o600);
      expect(await Bun.file(streamedArchivePath ?? "").exists()).toBe(false);
      expect(streamedRemoteCommand).toContain("revision_before");
      expect(streamedRemoteCommand).toContain("revision_after");
      expect(streamedRemoteCommand).toContain(
        '[ ! -d "$lock_dir" ] && [ "$revision_before" = "$revision_after" ]',
      );
    } finally {
      await rm(localDataRoot, { recursive: true, force: true });
      await rm(remoteRuntimeRoot, { recursive: true, force: true });
    }
  });

  test("[RT-CAP-REMOTE-011] read-only archive rejects lock or revision changes during streaming", async () => {
    for (const mutation of ["revision", "lock"] as const) {
      const localDataRoot = await mkdtemp(join(tmpdir(), `appaloft-fenced-${mutation}-local-`));
      const remoteRuntimeRoot = await mkdtemp(
        join(tmpdir(), `appaloft-fenced-${mutation}-remote-`),
      );
      const remoteStateRoot = join(remoteRuntimeRoot, "state");
      const baseRunner = createLocalSshArchiveRunner();

      try {
        await mkdir(join(localDataRoot, "pglite"), { recursive: true });
        await writeFile(join(localDataRoot, "pglite", "previous.txt"), "previous-mirror");
        await mkdir(join(remoteStateRoot, "pglite"), { recursive: true });
        await mkdir(join(remoteStateRoot, "source-links"), { recursive: true });
        await mkdir(join(remoteStateRoot, "server-applied-routes"), { recursive: true });
        await mkdir(join(remoteStateRoot, "locks"), { recursive: true });
        await writeFile(join(remoteStateRoot, "pglite", "next.txt"), "next-mirror");
        await writeFile(join(remoteStateRoot, "sync-revision.txt"), "0\n");

        const sync = new RemotePgliteArchiveSync(
          {
            dataRoot: remoteStateRoot,
            localDataRoot,
            localPgliteDataDir: join(localDataRoot, "pglite"),
            backupRetentionDays: 7,
            backupMaxCount: 20,
            target: { host: "127.0.0.1" },
            readOnly: true,
          },
          {
            run: baseRunner.run,
            async runToFile(input, outputPath) {
              const injected = (input.args.at(-1) ?? "").replace(
                "tar -czf - pglite source-links server-applied-routes",
                mutation === "revision"
                  ? 'tar -czf - pglite source-links server-applied-routes; printf "1\\n" > "$revision_file"'
                  : 'tar -czf - pglite source-links server-applied-routes; mkdir -p "$lock_dir"',
              );
              const process = Bun.spawn(["sh", "-lc", injected], {
                stdout: Bun.file(outputPath),
                stderr: "pipe",
              });
              const exitCode = await process.exited;
              return {
                exitCode,
                stdout: new Uint8Array(),
                stderr: await new Response(process.stderr).text(),
                failed: exitCode !== 0,
              };
            },
          },
        );

        const result = await sync.syncFromRemote();

        expect(result.isErr()).toBe(true);
        expect(await readFile(join(localDataRoot, "pglite", "previous.txt"), "utf8")).toBe(
          "previous-mirror",
        );
        expect(await Bun.file(join(localDataRoot, "pglite", "next.txt")).exists()).toBe(false);
      } finally {
        await rm(localDataRoot, { recursive: true, force: true });
        await rm(remoteRuntimeRoot, { recursive: true, force: true });
      }
    }
  });

  test("[CONFIG-FILE-STATE-012E] read-only archive and revision fail closed on a recovery marker", async () => {
    const localDataRoot = await mkdtemp(join(tmpdir(), "appaloft-marker-read-local-"));
    const remoteRuntimeRoot = await mkdtemp(join(tmpdir(), "appaloft-marker-read-remote-"));
    const remoteStateRoot = join(remoteRuntimeRoot, "state");
    try {
      await mkdir(join(remoteStateRoot, "pglite"), { recursive: true });
      await mkdir(join(remoteStateRoot, "source-links"), { recursive: true });
      await mkdir(join(remoteStateRoot, "server-applied-routes"), { recursive: true });
      await mkdir(join(remoteStateRoot, "recovery"), { recursive: true });
      await writeFile(join(remoteStateRoot, "sync-revision.txt"), "4\n");
      await writeFile(join(remoteStateRoot, "recovery", "remote-sync-upload.json"), "{}\n");
      const sync = new RemotePgliteArchiveSync(
        {
          dataRoot: remoteStateRoot,
          localDataRoot,
          localPgliteDataDir: join(localDataRoot, "pglite"),
          backupRetentionDays: 7,
          backupMaxCount: 20,
          target: { host: "127.0.0.1" },
          readOnly: true,
        },
        createLocalSshArchiveRunner(),
      );

      const archive = await sync.syncFromRemote();
      const revision = await sync.readRemoteRevision();

      expect(archive.isErr()).toBe(true);
      expect(revision.isErr()).toBe(true);
      expect(archive._unsafeUnwrapErr().details?.stderr).toContain(
        "remote_state_recovery_required",
      );
      expect(revision._unsafeUnwrapErr().details?.stderr).toContain(
        "remote_state_recovery_required",
      );
    } finally {
      await rm(localDataRoot, { recursive: true, force: true });
      await rm(remoteRuntimeRoot, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-STATE-012E] explicit v2 rollback reclaims staging before durability sync under disk pressure", async () => {
    const localDataRoot = await mkdtemp(join(tmpdir(), "appaloft-v2-disk-recovery-local-"));
    const remoteRuntimeRoot = await mkdtemp(join(tmpdir(), "appaloft-v2-disk-recovery-remote-"));
    const remoteStateRoot = join(remoteRuntimeRoot, "state");
    const transactionId = "sync-20260823080808-75";
    const backupRoot = join(remoteStateRoot, "backups", transactionId);
    const incomingName = `.incoming-${transactionId}`;
    const incomingRoot = join(remoteStateRoot, incomingName);
    const revisionTempName = `.sync-revision-${transactionId}.tmp`;
    const markerPath = join(remoteStateRoot, "recovery", "remote-sync-upload.json");
    try {
      for (const component of ["pglite", "source-links", "server-applied-routes"]) {
        await mkdir(join(backupRoot, component), { recursive: true });
        await mkdir(join(remoteStateRoot, component), { recursive: true });
        await mkdir(join(incomingRoot, component), { recursive: true });
        await writeFile(join(backupRoot, component, "state.txt"), `old-${component}`);
        await writeFile(join(remoteStateRoot, component, "state.txt"), `partial-${component}`);
        await writeFile(join(incomingRoot, component, "state.txt"), `staged-${component}`);
      }
      await writeFile(join(backupRoot, "pglite", "PG_VERSION"), "18\n");
      await mkdir(join(remoteStateRoot, "recovery"), { recursive: true });
      await writeFile(join(remoteStateRoot, "sync-revision.txt"), "4\n");
      await writeFile(join(remoteStateRoot, revisionTempName), "5\n");
      await writeFile(
        markerPath,
        `${JSON.stringify({
          schemaVersion: "remote-state-sync-recovery/v2",
          status: "active",
          transactionId,
          backupName: transactionId,
          incomingName,
          revisionTempName,
          expectedRevision: 4,
          nextRevision: 5,
          hadPglite: true,
          hadSourceLinks: true,
          hadServerAppliedRoutes: true,
        })}\n`,
      );

      const baseRunner = createLocalSshArchiveRunner();
      const sync = new RemotePgliteArchiveSync(
        {
          dataRoot: remoteStateRoot,
          localDataRoot,
          localPgliteDataDir: join(localDataRoot, "pglite"),
          backupRetentionDays: 7,
          backupMaxCount: 20,
          target: { host: "127.0.0.1" },
        },
        {
          run(input) {
            if (input.command !== "ssh") return baseRunner.run(input);
            const original = input.args.at(-1) ?? "";
            const durabilitySync = 'sync_path "$data_root" || exit 75';
            expect(original).toContain(durabilitySync);
            return baseRunner.run({
              ...input,
              args: [
                ...input.args.slice(0, -1),
                original.replaceAll(
                  durabilitySync,
                  `[ ! -d "$incoming_dir" ] || exit 75\n      ${durabilitySync}`,
                ),
              ],
            });
          },
        },
      );

      expect(sync.recoverRemoteTransaction().isOk()).toBe(true);
      for (const component of ["pglite", "source-links", "server-applied-routes"]) {
        expect(await readFile(join(remoteStateRoot, component, "state.txt"), "utf8")).toBe(
          `old-${component}`,
        );
      }
      expect(await Bun.file(incomingRoot).exists()).toBe(false);
      expect(await Bun.file(join(remoteStateRoot, revisionTempName)).exists()).toBe(false);
      expect(await Bun.file(markerPath).exists()).toBe(false);
    } finally {
      await rm(localDataRoot, { recursive: true, force: true });
      await rm(remoteRuntimeRoot, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-STATE-012G] remote state paths fail closed on directories and symlinks", async () => {
    const localDataRoot = await mkdtemp(join(tmpdir(), "appaloft-path-fence-local-"));
    const remoteRuntimeRoot = await mkdtemp(join(tmpdir(), "appaloft-path-fence-remote-"));
    const externalRoot = await mkdtemp(join(tmpdir(), "appaloft-path-fence-external-"));
    const remoteStateRoot = join(remoteRuntimeRoot, "state");
    const recoveryMarker = join(remoteStateRoot, "recovery", "remote-sync-upload.json");
    try {
      for (const root of [localDataRoot, remoteStateRoot]) {
        await mkdir(join(root, "pglite"), { recursive: true });
        await mkdir(join(root, "source-links"), { recursive: true });
        await mkdir(join(root, "server-applied-routes"), { recursive: true });
      }
      await mkdir(join(remoteStateRoot, "recovery"), { recursive: true });
      await mkdir(recoveryMarker);
      await writeFile(join(localDataRoot, "pglite", "local.txt"), "local-state");
      await writeFile(join(remoteStateRoot, "sync-revision.txt"), "0\n");
      const sync = new RemotePgliteArchiveSync(
        {
          dataRoot: remoteStateRoot,
          localDataRoot,
          localPgliteDataDir: join(localDataRoot, "pglite"),
          backupRetentionDays: 7,
          backupMaxCount: 20,
          target: { host: "127.0.0.1" },
          readOnly: true,
        },
        createLocalSshArchiveRunner(),
      );

      expect((await sync.syncFromRemote()).isErr()).toBe(true);
      expect((await sync.readRemoteRevision()).isErr()).toBe(true);
      expect(sync.recoverRemoteTransaction().isErr()).toBe(true);

      await rm(recoveryMarker, { recursive: true });
      await rm(join(remoteStateRoot, "sync-revision.txt"));
      const externalRevision = join(externalRoot, "revision.txt");
      await writeFile(externalRevision, "0\n");
      await symlink(externalRevision, join(remoteStateRoot, "sync-revision.txt"));
      expect((await sync.syncToRemote()).isErr()).toBe(true);
      expect(await readFile(externalRevision, "utf8")).toBe("0\n");

      await rm(join(remoteStateRoot, "sync-revision.txt"));
      await writeFile(join(remoteStateRoot, "sync-revision.txt"), "0\n");
      await rm(join(remoteStateRoot, "pglite"), { recursive: true });
      await mkdir(join(externalRoot, "pglite"));
      await writeFile(join(externalRoot, "pglite", "outside.txt"), "outside-state");
      await symlink(join(externalRoot, "pglite"), join(remoteStateRoot, "pglite"));
      expect((await sync.syncToRemote()).isErr()).toBe(true);
      expect(await readFile(join(externalRoot, "pglite", "outside.txt"), "utf8")).toBe(
        "outside-state",
      );

      await rm(join(remoteStateRoot, "pglite"));
      await mkdir(join(remoteStateRoot, "pglite"));
      await rm(join(remoteStateRoot, "backups"), { recursive: true, force: true });
      await symlink(externalRoot, join(remoteStateRoot, "backups"));
      expect((await sync.syncToRemote()).isErr()).toBe(true);
      expect((await readdir(externalRoot)).sort()).toEqual(["pglite", "revision.txt"]);

      await rm(join(remoteStateRoot, "backups"));
      await mkdir(join(remoteStateRoot, "backups"));
      await rm(join(remoteStateRoot, "recovery"), { recursive: true });
      const externalRecovery = join(externalRoot, "recovery-parent");
      await mkdir(externalRecovery);
      await symlink(externalRecovery, join(remoteStateRoot, "recovery"));
      expect((await sync.syncFromRemote()).isErr()).toBe(true);
      expect((await sync.readRemoteRevision()).isErr()).toBe(true);
      expect(sync.recoverRemoteTransaction().isErr()).toBe(true);
      expect(await readdir(externalRecovery)).toEqual([]);
    } finally {
      await rm(localDataRoot, { recursive: true, force: true });
      await rm(remoteRuntimeRoot, { recursive: true, force: true });
      await rm(externalRoot, { recursive: true, force: true });
    }
  });

  test("[CPS-REMOTE-015] SSH mirror upload streams the archive from a private file", async () => {
    const localDataRoot = await mkdtemp(join(tmpdir(), "appaloft-stream-upload-local-"));
    const remoteRuntimeRoot = await mkdtemp(join(tmpdir(), "appaloft-stream-upload-remote-"));
    const remoteStateRoot = join(remoteRuntimeRoot, "state");
    let streamedArchivePath: string | undefined;
    let streamedArchiveMode: number | undefined;

    try {
      await mkdir(join(localDataRoot, "pglite"), { recursive: true });
      await mkdir(join(localDataRoot, "source-links"), { recursive: true });
      await mkdir(join(localDataRoot, "server-applied-routes"), { recursive: true });
      await mkdir(join(remoteStateRoot, "pglite"), { recursive: true });
      await mkdir(join(remoteStateRoot, "source-links"), { recursive: true });
      await mkdir(join(remoteStateRoot, "server-applied-routes"), { recursive: true });
      await mkdir(join(remoteStateRoot, "locks"), { recursive: true });
      await writeFile(join(localDataRoot, "pglite", "updated.txt"), "updated-state");
      await writeFile(join(localDataRoot, "pglite", "PG_VERSION"), "18\n");
      await writeFile(join(remoteStateRoot, "sync-revision.txt"), "3\n");

      const baseRunner = createLocalSshArchiveRunner();
      const runner = {
        run(input: RemotePgliteArchiveRunnerInput) {
          if (input.command === "ssh" && input.stdin) {
            throw new Error("upload archive must not use an in-memory stdin buffer");
          }
          return baseRunner.run(input);
        },
        async runFromFile(input: RemotePgliteArchiveRunnerInput, inputPath: string) {
          streamedArchivePath = inputPath;
          streamedArchiveMode = (await stat(inputPath)).mode & 0o777;
          const command = ["sh", "-lc", input.args.at(-1) ?? ""];
          const process = Bun.spawn(command, {
            stdin: Bun.file(inputPath),
            stdout: "pipe",
            stderr: "pipe",
          });
          const exitCode = await process.exited;
          return {
            exitCode,
            stdout: new Uint8Array(await new Response(process.stdout).arrayBuffer()),
            stderr: await new Response(process.stderr).text(),
            failed: exitCode !== 0,
          };
        },
      };
      const sync = new RemotePgliteArchiveSync(
        {
          dataRoot: remoteStateRoot,
          localDataRoot,
          localPgliteDataDir: join(localDataRoot, "pglite"),
          backupRetentionDays: 7,
          backupMaxCount: 20,
          target: { host: "127.0.0.1" },
        },
        runner,
      );

      const result = await sync.syncToRemote({ expectedRevision: 3, nextRevision: 4 });

      expect(result.isOk()).toBe(true);
      expect(await readFile(join(remoteStateRoot, "pglite", "updated.txt"), "utf8")).toBe(
        "updated-state",
      );
      expect(await readFile(join(remoteStateRoot, "sync-revision.txt"), "utf8")).toBe("4\n");
      expect(streamedArchivePath).toBeDefined();
      expect(streamedArchiveMode).toBe(0o600);
      expect(await Bun.file(streamedArchivePath ?? "").exists()).toBe(false);
    } finally {
      await rm(localDataRoot, { recursive: true, force: true });
      await rm(remoteRuntimeRoot, { recursive: true, force: true });
    }
  });

  test("[CPS-REMOTE-015] SSH mirror upload removes its private archive when creation throws", async () => {
    const localDataRoot = await mkdtemp(join(tmpdir(), "appaloft-stream-cleanup-local-"));

    try {
      await mkdir(join(localDataRoot, "pglite"), { recursive: true });
      await mkdir(join(localDataRoot, "source-links"), { recursive: true });
      await mkdir(join(localDataRoot, "server-applied-routes"), { recursive: true });
      const sync = new RemotePgliteArchiveSync(
        {
          dataRoot: "/var/lib/appaloft/runtime/state",
          localDataRoot,
          localPgliteDataDir: join(localDataRoot, "pglite"),
          backupRetentionDays: 7,
          backupMaxCount: 20,
          target: { host: "127.0.0.1" },
        },
        {
          run(input: RemotePgliteArchiveRunnerInput) {
            if (input.command === "tar") {
              throw new Error("simulated archive creation failure");
            }
            throw new Error("unexpected runner call");
          },
        },
      );

      await expect(sync.syncToRemote({ expectedRevision: 3, nextRevision: 4 })).rejects.toThrow(
        "simulated archive creation failure",
      );
      const parentEntries = await readdir(join(localDataRoot, ".."));
      expect(
        parentEntries.some(
          (entry) =>
            entry.startsWith(`${basename(localDataRoot)}.upload-`) && entry.endsWith(".tar.gz"),
        ),
      ).toBe(false);
    } finally {
      await rm(localDataRoot, { recursive: true, force: true });
    }
  });

  test("[CPS-REMOTE-013] SSH secret rotation plan downloads state without uploading it", async () => {
    const localDataRoot = await mkdtemp(join(tmpdir(), "appaloft-secret-plan-local-"));
    const remoteRuntimeRoot = await mkdtemp(join(tmpdir(), "appaloft-secret-plan-remote-"));
    const remoteStateRoot = join(remoteRuntimeRoot, "state");

    try {
      await mkdir(join(remoteStateRoot, "pglite"), { recursive: true });
      await mkdir(join(remoteStateRoot, "locks"), { recursive: true });
      await mkdir(join(remoteStateRoot, "source-links"), { recursive: true });
      await mkdir(join(remoteStateRoot, "server-applied-routes"), { recursive: true });
      await writeFile(join(remoteStateRoot, "pglite", "live.txt"), "remote-live-state");
      await writeFile(join(remoteStateRoot, "pglite", "PG_VERSION"), "18\n");
      await writeFile(join(remoteStateRoot, "sync-revision.txt"), "7\n");
      await writeFile(
        join(remoteStateRoot, "schema-version.json"),
        '{"version":1,"migratedAt":"legacy"}\n',
      );
      const durableEntriesBefore = (await readdir(remoteStateRoot)).sort();

      const session = await prepareRemotePgliteStateSync({
        argv: [
          "appaloft",
          "db",
          "secret-rotation",
          "plan",
          "--state-backend",
          "ssh-pglite",
          "--server-host",
          "127.0.0.1",
        ],
        config: testConfig(localDataRoot, { remoteRuntimeRoot }),
        runner: createLocalSshArchiveRunner(),
      });

      expect(session.isOk()).toBe(true);
      if (session.isErr() || !session.value) {
        throw new Error("Expected read-only remote secret rotation session");
      }
      expect(session.value.readOnly).toBe(true);

      const released = await session.value.releaseForCliRuntime();
      const finalized = await session.value.syncBackAndRelease();

      expect(released.isOk()).toBe(true);
      expect(finalized.isOk()).toBe(true);
      expect(await readFile(join(remoteStateRoot, "sync-revision.txt"), "utf8")).toBe("7\n");
      expect(await readFile(join(remoteStateRoot, "pglite", "live.txt"), "utf8")).toBe(
        "remote-live-state",
      );
      expect(await readFile(join(remoteStateRoot, "schema-version.json"), "utf8")).toBe(
        '{"version":1,"migratedAt":"legacy"}\n',
      );
      expect((await readdir(remoteStateRoot)).sort()).toEqual(durableEntriesBefore);
      expect(await readdir(join(remoteStateRoot, "locks"))).toEqual([]);
    } finally {
      await rm(localDataRoot, { recursive: true, force: true });
      await rm(remoteRuntimeRoot, { recursive: true, force: true });
    }
  });

  test("[CPS-COMPAT-031] SSH rotation plan blocks an incompatible PGlite PostgreSQL major before opening the mirror", async () => {
    const localDataRoot = await mkdtemp(join(tmpdir(), "appaloft-secret-plan-version-local-"));
    const remoteRuntimeRoot = await mkdtemp(join(tmpdir(), "appaloft-secret-plan-version-remote-"));
    const remoteStateRoot = join(remoteRuntimeRoot, "state");

    try {
      await mkdir(join(remoteStateRoot, "pglite"), { recursive: true });
      await mkdir(join(remoteStateRoot, "locks"), { recursive: true });
      await mkdir(join(remoteStateRoot, "source-links"), { recursive: true });
      await mkdir(join(remoteStateRoot, "server-applied-routes"), { recursive: true });
      await writeFile(join(remoteStateRoot, "pglite", "PG_VERSION"), "17\n");
      await writeFile(join(remoteStateRoot, "pglite", "private-row.bin"), "private state");
      await writeFile(join(remoteStateRoot, "sync-revision.txt"), "7\n");
      await writeFile(
        join(remoteStateRoot, "schema-version.json"),
        '{"version":1,"migratedAt":"legacy"}\n',
      );
      const durableEntriesBefore = (await readdir(remoteStateRoot)).sort();

      const session = await prepareRemotePgliteStateSync({
        argv: [
          "appaloft",
          "db",
          "secret-rotation",
          "plan",
          "--state-backend",
          "ssh-pglite",
          "--server-host",
          "127.0.0.1",
        ],
        config: testConfig(localDataRoot, { remoteRuntimeRoot }),
        runner: createLocalSshArchiveRunner(),
      });

      expect(session.isErr()).toBe(true);
      if (session.isOk()) throw new Error("Expected incompatible PGlite major failure");
      expect(session.error.details).toMatchObject({
        phase: "remote-state-sync-download",
        stateBackend: "ssh-pglite",
        reason: "remote_pglite_postgres_major_incompatible",
        sourcePostgresMajor: "17",
        requiredPostgresMajor: "18",
      });
      expect(JSON.stringify(session.error)).not.toContain("private state");
      expect(JSON.stringify(session.error)).not.toContain("private-row.bin");
      expect((await readdir(remoteStateRoot)).sort()).toEqual(durableEntriesBefore);
      expect(await readdir(join(remoteStateRoot, "locks"))).toEqual([]);
    } finally {
      await rm(localDataRoot, { recursive: true, force: true });
      await rm(remoteRuntimeRoot, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-STATE-010] SSH deploy plans a remote PGlite local mirror before composition", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-"));
    try {
      const plan = resolveRemotePgliteStateSyncPlan(
        [
          "appaloft",
          "deploy",
          ".",
          "--server-host",
          "203.0.113.10",
          "--server-port=2222",
          "--server-ssh-username",
          "deploy",
          "--server-ssh-private-key-file",
          "/home/runner/.ssh/appaloft",
        ],
        {},
        testConfig(dataDir),
      );

      expect(plan.isOk()).toBe(true);
      if (plan.isErr() || !plan.value) {
        throw new Error("Expected remote PGlite plan");
      }
      expect(plan.value.dataRoot).toBe("/var/lib/appaloft/runtime/state");
      expect(plan.value.localDataRoot).toContain("remote-pglite");
      expect(plan.value.localPgliteDataDir).toContain("remote-pglite");
      expect(plan.value.target).toEqual({
        host: "203.0.113.10",
        port: 2222,
        username: "deploy",
        identityFile: "/home/runner/.ssh/appaloft",
      });
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  test("[UP-ENTRY-004] a path named up is not mistaken for the deployment command", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-"));
    try {
      const plan = resolveRemotePgliteStateSyncPlan(
        ["appaloft", "code", "up", "--server-host", "203.0.113.10"],
        {},
        testConfig(dataDir),
      );

      expect(plan.isOk()).toBe(true);
      expect(plan._unsafeUnwrap()).toBe(null);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-STATE-022] db migrate targets an explicit isolated SSH runtime root", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "appaloft-remote-migrate-"));
    try {
      const plan = resolveRemotePgliteStateSyncPlan(
        [
          "appaloft",
          "db",
          "migrate",
          "--state-backend",
          "ssh-pglite",
          "--server-host",
          "203.0.113.10",
          "--remote-runtime-root",
          "/var/lib/appaloft/recovery/candidate-123",
        ],
        {},
        testConfig(dataDir),
      );

      expect(plan.isOk()).toBe(true);
      if (plan.isErr() || !plan.value) {
        throw new Error("Expected isolated remote PGlite migration plan");
      }
      expect(plan.value.dataRoot).toBe("/var/lib/appaloft/recovery/candidate-123/state");
      expect(plan.value.readOnly).toBe(false);
      expect(plan.value.target.host).toBe("203.0.113.10");
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  test("[RT-CAP-REMOTE-011] server capacity maintenance plans coordinated SSH PGlite state", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "appaloft-remote-capacity-"));
    try {
      const commonArgs = [
        "--state-backend",
        "ssh-pglite",
        "--server-host",
        "203.0.113.10",
        "--server-port",
        "2222",
        "--server-ssh-username",
        "deploy",
        "--server-ssh-private-key-file",
        "/home/runner/.ssh/appaloft",
        "--remote-runtime-root",
        "/var/lib/appaloft/runtime",
      ];
      const inspectPlan = resolveRemotePgliteStateSyncPlan(
        ["appaloft", "server", "capacity", "inspect", "srv_primary", ...commonArgs],
        {},
        testConfig(dataDir),
      );
      const prunePlan = resolveRemotePgliteStateSyncPlan(
        [
          "appaloft",
          "server",
          "capacity",
          "prune",
          "srv_primary",
          "--before",
          "2026-01-01T00:00:00.000Z",
          "--dry-run",
          "false",
          ...commonArgs,
        ],
        {},
        testConfig(dataDir),
      );
      const dryRunPlan = resolveRemotePgliteStateSyncPlan(
        [
          "appaloft",
          "server",
          "capacity",
          "prune",
          "srv_primary",
          "--before",
          "2026-01-01T00:00:00.000Z",
          ...commonArgs,
        ],
        {},
        testConfig(dataDir),
      );

      expect(inspectPlan.isOk()).toBe(true);
      expect(prunePlan.isOk()).toBe(true);
      expect(dryRunPlan.isOk()).toBe(true);
      if (
        inspectPlan.isErr() ||
        !inspectPlan.value ||
        prunePlan.isErr() ||
        !prunePlan.value ||
        dryRunPlan.isErr() ||
        !dryRunPlan.value
      ) {
        throw new Error("Expected remote PGlite capacity plans");
      }
      expect(inspectPlan.value).toMatchObject({
        dataRoot: "/var/lib/appaloft/runtime/state",
        readOnly: true,
        target: {
          host: "203.0.113.10",
          port: 2222,
          username: "deploy",
          identityFile: "/home/runner/.ssh/appaloft",
        },
      });
      expect(prunePlan.value).toMatchObject({
        dataRoot: "/var/lib/appaloft/runtime/state",
        readOnly: false,
        target: {
          host: "203.0.113.10",
          port: 2222,
          username: "deploy",
          identityFile: "/home/runner/.ssh/appaloft",
        },
      });
      expect(dryRunPlan.value.readOnly).toBe(true);

      const invalidPort = resolveRemotePgliteStateSyncPlan(
        [
          "appaloft",
          "server",
          "capacity",
          "prune",
          "srv_primary",
          "--before",
          "2026-01-01T00:00:00.000Z",
          "--dry-run",
          "false",
          "--state-backend",
          "ssh-pglite",
          "--server-host",
          "203.0.113.10",
          "--server-port",
          "70000",
        ],
        {},
        testConfig(dataDir),
      );
      expect(invalidPort._unsafeUnwrapErr()).toMatchObject({
        code: "validation_error",
        details: {
          phase: "remote-state-resolution",
          stateBackend: "ssh-pglite",
        },
      });
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  test("[CPS-REMOTE-035] environment variable repair targets an explicit isolated SSH runtime root", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "appaloft-remote-env-repair-"));
    try {
      for (const command of ["set", "unset"] as const) {
        const plan = resolveRemotePgliteStateSyncPlan(
          [
            "appaloft",
            "env",
            command,
            "env_demo",
            "APP_SECRET",
            ...(command === "set" ? ["private-value", "--kind", "secret", "--secret"] : []),
            "--exposure",
            "runtime",
            "--scope",
            "environment",
            "--state-backend",
            "ssh-pglite",
            "--server-host",
            "203.0.113.10",
            "--remote-runtime-root",
            "/var/lib/appaloft/recovery/candidate-123",
          ],
          {},
          testConfig(dataDir),
        );

        expect(plan.isOk()).toBe(true);
        if (plan.isErr() || !plan.value) {
          throw new Error(`Expected isolated remote PGlite env ${command} plan`);
        }
        expect(plan.value.dataRoot).toBe("/var/lib/appaloft/recovery/candidate-123/state");
        expect(plan.value.readOnly).toBe(false);
        expect(plan.value.target.host).toBe("203.0.113.10");
      }
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-STATE-007] local or control-plane state skips remote PGlite sync", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-"));
    try {
      const local = resolveRemotePgliteStateSyncPlan(
        [
          "appaloft",
          "deploy",
          ".",
          "--server-host",
          "203.0.113.10",
          "--state-backend",
          "local-pglite",
        ],
        {},
        testConfig(dataDir),
      );
      const controlPlane = resolveRemotePgliteStateSyncPlan(
        ["appaloft", "deploy", ".", "--server-host", "203.0.113.10"],
        { APPALOFT_DATABASE_URL: "postgres://postgres:postgres@example.test/appaloft" },
        testConfig(dataDir),
      );

      expect(local.isOk()).toBe(true);
      expect(controlPlane.isOk()).toBe(true);
      if (local.isErr() || controlPlane.isErr()) {
        throw new Error("Expected sync plan resolution to succeed");
      }
      expect(local.value).toBeNull();
      expect(controlPlane.value).toBeNull();
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-STATE-014] postgres-control-plane mode does not create remote PGlite backups", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-"));
    const calls: RemotePgliteArchiveRunnerInput[] = [];
    try {
      const prepared = await prepareRemotePgliteStateSync({
        argv: [
          "appaloft",
          "deploy",
          ".",
          "--server-host",
          "203.0.113.10",
          "--state-backend",
          "postgres-control-plane",
        ],
        config: testConfig(dataDir),
        runner: {
          run(input) {
            calls.push(input);
            return {
              exitCode: 0,
              stdout: new Uint8Array(),
              stderr: "",
              failed: false,
            };
          },
        },
      });

      expect(prepared.isOk()).toBe(true);
      if (prepared.isErr()) {
        throw new Error(prepared.error.message);
      }
      expect(prepared.value).toBeNull();
      expect(calls).toMatchSnapshot();
      expect(calls.map((call) => call.command)).toEqual(["ssh"]);
      expect(calls.map((call) => call.args.join(" ")).join("\n")).toContain("backend.json");
      expect(calls.map((call) => call.args.join(" ")).join("\n")).not.toContain("backups/sync-");
      expect(calls.map((call) => call.command)).not.toContain("tar");
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-STATE-014] fresh postgres-control-plane mode writes a server backend marker", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-local-"));
    const remoteRuntimeRoot = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-remote-"));
    const remoteStateRoot = join(remoteRuntimeRoot, "state");

    try {
      const prepared = await prepareRemotePgliteStateSync({
        argv: [
          "appaloft",
          "deploy",
          ".",
          "--server-host",
          "127.0.0.1",
          "--state-backend",
          "postgres-control-plane",
        ],
        config: testConfig(dataDir, { remoteRuntimeRoot }),
        runner: createLocalSshArchiveRunner(),
      });

      expect(prepared.isOk()).toBe(true);
      if (prepared.isErr()) {
        throw new Error(prepared.error.message);
      }
      expect(prepared.value).toBeNull();
      expect(
        JSON.parse(await readFile(join(remoteStateRoot, "backend.json"), "utf8")),
      ).toMatchObject({
        schemaVersion: "server-state-backend/v1",
        stateBackend: "postgres-control-plane",
        owner: "appaloft-control-plane",
      });
      expect(await readdir(remoteStateRoot)).toEqual(["backend.json"]);

      const sshPglite = await prepareRemotePgliteStateSync({
        argv: [
          "appaloft",
          "deploy",
          ".",
          "--server-host",
          "127.0.0.1",
          "--state-backend",
          "ssh-pglite",
        ],
        config: testConfig(dataDir, { remoteRuntimeRoot }),
        runner: createLocalSshArchiveRunner(),
      });

      expect(sshPglite.isErr()).toBe(true);
      if (sshPglite.isOk()) {
        throw new Error("Expected ssh-pglite to reject a postgres-control-plane marker");
      }
      expect(sshPglite.error).toMatchObject({
        code: "server_state_backend_mismatch",
        details: {
          phase: "server-state-backend",
          reason: "SERVER_STATE_BACKEND_MISMATCH",
          expectedStateBackend: "ssh-pglite",
          actualStateBackend: "postgres-control-plane",
        },
      });
    } finally {
      await rm(dataDir, { recursive: true, force: true });
      await rm(remoteRuntimeRoot, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-STATE-015] postgres-control-plane mode rejects an ssh-pglite server marker", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-"));
    try {
      const prepared = await prepareRemotePgliteStateSync({
        argv: [
          "appaloft",
          "deploy",
          ".",
          "--server-host",
          "203.0.113.10",
          "--server-port",
          "2222",
          "--state-backend",
          "postgres-control-plane",
        ],
        config: testConfig(dataDir),
        runner: {
          run() {
            return {
              exitCode: 0,
              stdout: new TextEncoder().encode(
                '{"schemaVersion":"server-state-backend/v1","stateBackend":"ssh-pglite","updatedAt":"2026-05-19T00:00:00.000Z"}\n',
              ),
              stderr: "",
              failed: false,
            };
          },
        },
      });

      expect(prepared.isErr()).toBe(true);
      if (prepared.isOk()) {
        throw new Error("Expected state backend mismatch");
      }
      expect(prepared.error).toMatchObject({
        code: "server_state_backend_mismatch",
        retryable: false,
        details: {
          phase: "server-state-backend",
          reason: "SERVER_STATE_BACKEND_MISMATCH",
          expectedStateBackend: "postgres-control-plane",
          actualStateBackend: "ssh-pglite",
          host: "203.0.113.10",
          port: "2222",
        },
      });
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-STATE-015] postgres-control-plane mode rejects invalid server backend markers", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-local-"));
    const remoteRuntimeRoot = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-remote-"));
    const remoteStateRoot = join(remoteRuntimeRoot, "state");

    try {
      await mkdir(remoteStateRoot, { recursive: true });
      await writeFile(join(remoteStateRoot, "backend.json"), "not-json\n");

      const prepared = await prepareRemotePgliteStateSync({
        argv: [
          "appaloft",
          "deploy",
          ".",
          "--server-host",
          "127.0.0.1",
          "--state-backend",
          "postgres-control-plane",
        ],
        config: testConfig(dataDir, { remoteRuntimeRoot }),
        runner: createLocalSshArchiveRunner(),
      });

      expect(prepared.isErr()).toBe(true);
      if (prepared.isOk()) {
        throw new Error("Expected invalid state backend marker rejection");
      }
      expect(prepared.error).toMatchObject({
        code: "server_state_backend_mismatch",
        details: {
          phase: "server-state-backend",
          reason: "SERVER_STATE_BACKEND_MISMATCH",
          expectedStateBackend: "postgres-control-plane",
          actualStateBackend: "unknown",
        },
      });
    } finally {
      await rm(dataDir, { recursive: true, force: true });
      await rm(remoteRuntimeRoot, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-STATE-015] postgres-control-plane mode rejects a local-pglite server marker", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-"));
    try {
      const prepared = await prepareRemotePgliteStateSync({
        argv: [
          "appaloft",
          "deploy",
          ".",
          "--server-host",
          "203.0.113.10",
          "--state-backend",
          "postgres-control-plane",
        ],
        config: testConfig(dataDir),
        runner: {
          run() {
            return {
              exitCode: 0,
              stdout: new TextEncoder().encode(
                '{"schemaVersion":"server-state-backend/v1","stateBackend":"local-pglite"}\n',
              ),
              stderr: "",
              failed: false,
            };
          },
        },
      });

      expect(prepared.isErr()).toBe(true);
      if (prepared.isOk()) {
        throw new Error("Expected local-pglite state backend marker rejection");
      }
      expect(prepared.error).toMatchObject({
        code: "server_state_backend_mismatch",
        details: {
          phase: "server-state-backend",
          reason: "SERVER_STATE_BACKEND_MISMATCH",
          expectedStateBackend: "postgres-control-plane",
          actualStateBackend: "local-pglite",
        },
      });
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-STATE-010] explicit ssh-pglite state backend wins over ambient control-plane env", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-"));
    const calls: RemotePgliteArchiveRunnerInput[] = [];
    try {
      const session = await prepareRemotePgliteStateSync({
        argv: [
          "appaloft",
          "deploy",
          ".",
          "--server-host",
          "203.0.113.10",
          "--state-backend",
          "ssh-pglite",
        ],
        env: {
          APPALOFT_DATABASE_URL: "postgres://postgres:postgres@example.test/appaloft",
        },
        config: testConfig(dataDir),
        runner: {
          run(input) {
            calls.push(input);

            if (input.command === "tar") {
              return {
                exitCode: 0,
                stdout: new Uint8Array(),
                stderr: "",
                failed: false,
              };
            }

            const joinedArgs = input.args.join(" ");
            if (joinedArgs.includes("sync-revision.txt")) {
              return {
                exitCode: 0,
                stdout: new TextEncoder().encode("0\n"),
                stderr: "",
                failed: false,
              };
            }

            return {
              exitCode: 0,
              stdout: new TextEncoder().encode("archive"),
              stderr: "",
              failed: false,
            };
          },
        },
      });

      expect(session.isOk()).toBe(true);
      if (session.isErr() || !session.value) {
        throw new Error("Expected explicit ssh-pglite remote sync session");
      }
      expect(calls.map((call) => call.args.join(" ")).join("\n")).not.toContain(
        "postgres-control-plane",
      );
      expect(calls.map((call) => call.command)).toContain("tar");

      const released = await session.value.releaseForCliRuntime();
      expect(released.isOk()).toBe(true);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  test("[SOURCE-LINK-STATE-012] source relink plans the same remote PGlite mirror", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-"));
    try {
      const plan = resolveRemotePgliteStateSyncPlan(
        [
          "appaloft",
          "source-links",
          "relink",
          "source-fingerprint:v1:branch%3Amain",
          "--project",
          "prj_demo",
          "--environment",
          "env_demo",
          "--resource",
          "res_demo",
          "--server-host",
          "203.0.113.10",
          "--server-ssh-username",
          "deploy",
        ],
        {},
        testConfig(dataDir),
      );

      expect(plan.isOk()).toBe(true);
      if (plan.isErr() || !plan.value) {
        throw new Error("Expected remote PGlite plan");
      }
      expect(plan.value.dataRoot).toBe("/var/lib/appaloft/runtime/state");
      expect(plan.value.localPgliteDataDir).toContain("remote-pglite");
      expect(plan.value.target).toEqual({
        host: "203.0.113.10",
        username: "deploy",
      });
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-STATE-010] preview cleanup plans the same remote PGlite mirror", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-"));
    try {
      const plan = resolveRemotePgliteStateSyncPlan(
        [
          "appaloft",
          "preview",
          "cleanup",
          ".",
          "--preview",
          "pull-request",
          "--preview-id",
          "pr-5",
          "--server-host",
          "203.0.113.10",
          "--server-ssh-username",
          "deploy",
        ],
        {},
        testConfig(dataDir),
      );

      expect(plan.isOk()).toBe(true);
      if (plan.isErr() || !plan.value) {
        throw new Error("Expected remote PGlite plan");
      }
      expect(plan.value.dataRoot).toBe("/var/lib/appaloft/runtime/state");
      expect(plan.value.localPgliteDataDir).toContain("remote-pglite");
      expect(plan.value.target).toEqual({
        host: "203.0.113.10",
        username: "deploy",
      });
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-STATE-010] archive sync downloads and uploads PGlite over SSH", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-"));
    const calls: RemotePgliteArchiveRunnerInput[] = [];
    try {
      const sync = new RemotePgliteArchiveSync(
        {
          dataRoot: "/var/lib/appaloft/runtime/state",
          localDataRoot: dataDir,
          localPgliteDataDir: join(dataDir, "pglite"),
          backupRetentionDays: 7,
          backupMaxCount: 20,
          target: {
            host: "203.0.113.10",
            port: 22,
            username: "deploy",
            identityFile: "/home/runner/.ssh/appaloft",
          },
        },
        {
          run(input) {
            calls.push(input);
            return {
              exitCode: 0,
              stdout: new TextEncoder().encode("archive"),
              stderr: "",
              failed: false,
            };
          },
        },
      );

      const downloaded = await sync.syncFromRemote();
      const uploaded = await sync.syncToRemote();

      expect(downloaded.isOk()).toBe(true);
      expect(uploaded.isOk()).toBe(true);
      expect(calls.map((call) => call.command)).toEqual(["ssh", "tar", "tar", "ssh"]);
      const downloadCommand = calls[0]?.args.join(" ") ?? "";
      const uploadCommand = calls[3]?.args.join(" ") ?? "";
      expect(downloadCommand).toContain("tar -czf - pglite source-links server-applied-routes");
      expect(uploadCommand).toContain('backup_dir="$data_root/backups/$backup_name"');
      expect(uploadCommand).toContain("rollback_transaction");
      expect(uploadCommand).toContain("handle_transaction_exit");
      expect(uploadCommand).toContain("remote-sync-upload.json");
      expect(uploadCommand).toContain('tar -xzf - -C "$incoming_dir"');
      expect(uploadCommand).toContain("prune_old_sync_backups 1");
      expect(uploadCommand).not.toContain("cp -a");
      expect(uploadCommand.indexOf('tar -xzf - -C "$incoming_dir"')).toBeLessThan(
        uploadCommand.indexOf('mv "$data_root/pglite" "$backup_dir/pglite"'),
      );
      expect(uploadCommand.indexOf('> "$revision_temp"')).toBeLessThan(
        uploadCommand.indexOf('mv "$data_root/pglite" "$backup_dir/pglite"'),
      );
      expect(uploadCommand.indexOf('mv "$recovery_temp" "$recovery_file"')).toBeLessThan(
        uploadCommand.indexOf('mv "$data_root/pglite" "$backup_dir/pglite"'),
      );
      const markerSyncIndex = uploadCommand.indexOf('sync_path "$recovery_temp"');
      const markerPublishIndex = uploadCommand.indexOf('mv "$recovery_temp" "$recovery_file"');
      const markerParentSyncIndex = uploadCommand.indexOf(
        'sync_path "$recovery_dir"',
        markerPublishIndex,
      );
      const revisionCommitIndex = uploadCommand.indexOf('mv "$revision_temp" "$revision_file"');
      const liveTreeSyncIndex = uploadCommand.lastIndexOf(
        'sync_path "$data_root"',
        revisionCommitIndex,
      );
      const globalLiveTreeSyncIndex = uploadCommand.lastIndexOf(
        "sync || exit 75",
        revisionCommitIndex,
      );
      const revisionFileSyncIndex = uploadCommand.indexOf(
        'sync_path "$revision_file"',
        revisionCommitIndex,
      );
      const dataRootCommitSyncIndex = uploadCommand.indexOf(
        'sync_path "$data_root"',
        revisionCommitIndex,
      );
      const rollbackFunctionIndex = uploadCommand.indexOf("rollback_transaction() {");
      const rollbackDataRootSyncIndex = uploadCommand.indexOf(
        'sync_path "$data_root"',
        rollbackFunctionIndex,
      );
      const rollbackMarkerRemoveIndex = uploadCommand.indexOf(
        'rm -f "$recovery_file"',
        rollbackFunctionIndex,
      );
      const rollbackRecoverySyncIndex = uploadCommand.indexOf(
        'sync_path "$recovery_dir"',
        rollbackMarkerRemoveIndex,
      );
      expect(markerSyncIndex).toBeLessThan(markerPublishIndex);
      expect(markerPublishIndex).toBeLessThan(markerParentSyncIndex);
      expect(globalLiveTreeSyncIndex).toBeLessThan(liveTreeSyncIndex);
      expect(liveTreeSyncIndex).toBeLessThan(revisionCommitIndex);
      expect(revisionCommitIndex).toBeLessThan(revisionFileSyncIndex);
      expect(revisionFileSyncIndex).toBeLessThan(dataRootCommitSyncIndex);
      expect(dataRootCommitSyncIndex).toBeLessThan(uploadCommand.indexOf("commit_durable=true"));
      expect(rollbackDataRootSyncIndex).toBeLessThan(rollbackMarkerRemoveIndex);
      expect(rollbackMarkerRemoveIndex).toBeLessThan(rollbackRecoverySyncIndex);
      expect(uploadCommand.indexOf("commit_durable=true")).toBeLessThan(
        uploadCommand.indexOf(
          "trap - EXIT HUP INT TERM",
          uploadCommand.indexOf("commit_durable=true"),
        ),
      );
      expect(calls.map((call) => call.args.join(" ")).join("\n")).not.toContain(
        "OPENSSH PRIVATE KEY",
      );
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-STATE-011] interrupted download keeps the previous local mirror", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-"));
    const calls: RemotePgliteArchiveRunnerInput[] = [];
    try {
      await mkdir(join(dataDir, "pglite"), { recursive: true });
      await mkdir(join(dataDir, "source-links"), { recursive: true });
      await mkdir(join(dataDir, "server-applied-routes"), { recursive: true });
      await writeFile(join(dataDir, "pglite", "previous.txt"), "previous-state");

      const sync = new RemotePgliteArchiveSync(
        {
          dataRoot: "/var/lib/appaloft/runtime/state",
          localDataRoot: dataDir,
          localPgliteDataDir: join(dataDir, "pglite"),
          backupRetentionDays: 7,
          backupMaxCount: 20,
          target: {
            host: "203.0.113.10",
            port: 22,
            username: "deploy",
          },
        },
        {
          run(input) {
            calls.push(input);
            if (input.command === "tar") {
              return {
                exitCode: 2,
                stdout: new Uint8Array(),
                stderr: "bad archive",
                failed: true,
              };
            }

            return {
              exitCode: 0,
              stdout: new TextEncoder().encode("not-a-valid-archive"),
              stderr: "",
              failed: false,
            };
          },
        },
      );

      const downloaded = await sync.syncFromRemote();
      const previous = await readFile(join(dataDir, "pglite", "previous.txt"), "utf8");

      expect(downloaded.isErr()).toBe(true);
      if (downloaded.isOk()) {
        throw new Error("Expected download extraction failure");
      }
      expect(downloaded.error).toMatchObject({
        code: "infra_error",
        details: {
          phase: "remote-state-sync-download",
        },
      });
      expect(previous).toBe("previous-state");
      expect(calls.map((call) => call.command)).toEqual(["ssh", "tar"]);
      expect(calls[1]?.args.join(" ")).toContain(".download-");
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-STATE-012] interrupted upload uses staged rotation recovery commands", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-"));
    const calls: RemotePgliteArchiveRunnerInput[] = [];
    try {
      await mkdir(join(dataDir, "pglite"), { recursive: true });
      await mkdir(join(dataDir, "source-links"), { recursive: true });
      await mkdir(join(dataDir, "server-applied-routes"), { recursive: true });
      await writeFile(join(dataDir, "pglite", "current.txt"), "current-state");

      const sync = new RemotePgliteArchiveSync(
        {
          dataRoot: "/var/lib/appaloft/runtime/state",
          localDataRoot: dataDir,
          localPgliteDataDir: join(dataDir, "pglite"),
          backupRetentionDays: 7,
          backupMaxCount: 20,
          target: {
            host: "203.0.113.10",
            port: 22,
            username: "deploy",
            identityFile: "/home/runner/.ssh/appaloft",
          },
        },
        {
          run(input) {
            calls.push(input);
            if (input.command === "ssh") {
              return {
                exitCode: 74,
                stdout: new Uint8Array(),
                stderr: "remote tar failed",
                failed: true,
              };
            }

            return {
              exitCode: 0,
              stdout: new TextEncoder().encode("archive"),
              stderr: "",
              failed: false,
            };
          },
        },
      );

      const uploaded = await sync.syncToRemote();
      const remoteCommand = calls[1]?.args.join(" ") ?? "";

      expect(uploaded.isErr()).toBe(true);
      if (uploaded.isOk()) {
        throw new Error("Expected upload failure");
      }
      expect(uploaded.error).toMatchObject({
        code: "infra_error",
        details: {
          phase: "remote-state-sync-upload",
          exitCode: 74,
        },
      });
      expect(calls.map((call) => call.command)).toEqual(["tar", "ssh"]);
      expect(remoteCommand).toContain('backup_dir="$data_root/backups/$backup_name"');
      expect(remoteCommand).toContain("backup_retention_days='7'");
      expect(remoteCommand).toContain("prune_old_sync_backups");
      expect(remoteCommand).toContain("rollback_transaction");
      expect(remoteCommand).toContain("handle_transaction_exit");
      expect(remoteCommand).toContain('"status":"active"');
      expect(remoteCommand).toContain("remote-sync-upload.json");
      expect(remoteCommand).toContain('tar -xzf - -C "$incoming_dir"');
      expect(remoteCommand).not.toContain("cp -a");
      expect(remoteCommand).not.toContain("OPENSSH PRIVATE KEY");
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-STATE-012A] invalid incoming archive leaves live remote state untouched", async () => {
    const localDataRoot = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-local-"));
    const remoteRuntimeRoot = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-remote-"));
    const remoteStateRoot = join(remoteRuntimeRoot, "state");
    const backupRoot = join(remoteStateRoot, "backups");

    try {
      await mkdir(join(localDataRoot, "pglite"), { recursive: true });
      await mkdir(join(localDataRoot, "source-links"), { recursive: true });
      await mkdir(join(localDataRoot, "server-applied-routes"), { recursive: true });
      await writeFile(join(localDataRoot, "pglite", "local.txt"), "local-state");
      await writeFile(join(localDataRoot, "pglite", "PG_VERSION"), "18\n");
      await mkdir(join(remoteStateRoot, "pglite"), { recursive: true });
      await mkdir(join(remoteStateRoot, "source-links"), { recursive: true });
      await mkdir(join(remoteStateRoot, "server-applied-routes"), { recursive: true });
      await writeFile(join(remoteStateRoot, "pglite", "live.txt"), "authoritative-state");
      await writeFile(join(remoteStateRoot, "sync-revision.txt"), "0\n");
      await mkdir(join(backupRoot, "sync-20990101000300-newest"), { recursive: true });
      await mkdir(join(backupRoot, "sync-20990101000200-middle"), { recursive: true });
      await mkdir(join(backupRoot, "sync-20990101000100-oldest"), { recursive: true });
      await mkdir(join(backupRoot, "manual-keep"), { recursive: true });

      const baseRunner = createLocalSshArchiveRunner();
      const sync = new RemotePgliteArchiveSync(
        {
          dataRoot: remoteStateRoot,
          localDataRoot,
          localPgliteDataDir: join(localDataRoot, "pglite"),
          backupRetentionDays: 7,
          backupMaxCount: 3,
          target: {
            host: "127.0.0.1",
          },
        },
        {
          run(input) {
            if (input.command !== "ssh") return baseRunner.run(input);
            return baseRunner.run({
              ...input,
              stdin: new TextEncoder().encode("not-a-tar-archive"),
            });
          },
        },
      );

      const uploaded = await sync.syncToRemote();

      expect(uploaded.isErr()).toBe(true);
      expect(await readFile(join(remoteStateRoot, "pglite", "live.txt"), "utf8")).toBe(
        "authoritative-state",
      );
      expect(await readFile(join(remoteStateRoot, "sync-revision.txt"), "utf8")).toBe("0\n");
      expect((await readdir(backupRoot)).filter((name) => name.startsWith("sync-"))).toHaveLength(
        2,
      );
      expect(await readdir(backupRoot)).toContain("manual-keep");
      expect(await readdir(join(remoteStateRoot, "recovery"))).toEqual([]);
      expect(
        (await readdir(remoteStateRoot)).filter((name) => name.startsWith(".incoming-sync-")),
      ).toEqual([]);
    } finally {
      await rm(localDataRoot, { recursive: true, force: true });
      await rm(remoteRuntimeRoot, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-STATE-012A] incoming PGlite without version evidence leaves live state untouched", async () => {
    const localDataRoot = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-local-"));
    const remoteRuntimeRoot = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-remote-"));
    const remoteStateRoot = join(remoteRuntimeRoot, "state");

    try {
      await mkdir(join(localDataRoot, "pglite"), { recursive: true });
      await mkdir(join(localDataRoot, "source-links"), { recursive: true });
      await mkdir(join(localDataRoot, "server-applied-routes"), { recursive: true });
      await writeFile(join(localDataRoot, "pglite", "local.txt"), "local-state");
      await mkdir(join(remoteStateRoot, "pglite"), { recursive: true });
      await mkdir(join(remoteStateRoot, "source-links"), { recursive: true });
      await mkdir(join(remoteStateRoot, "server-applied-routes"), { recursive: true });
      await writeFile(join(remoteStateRoot, "pglite", "live.txt"), "authoritative-state");
      await writeFile(join(remoteStateRoot, "sync-revision.txt"), "0\n");

      const sync = new RemotePgliteArchiveSync(
        {
          dataRoot: remoteStateRoot,
          localDataRoot,
          localPgliteDataDir: join(localDataRoot, "pglite"),
          backupRetentionDays: 7,
          backupMaxCount: 20,
          target: { host: "127.0.0.1" },
        },
        createLocalSshArchiveRunner(),
      );

      const uploaded = await sync.syncToRemote();

      expect(uploaded.isErr()).toBe(true);
      expect(await readFile(join(remoteStateRoot, "pglite", "live.txt"), "utf8")).toBe(
        "authoritative-state",
      );
      expect(await readFile(join(remoteStateRoot, "sync-revision.txt"), "utf8")).toBe("0\n");
      expect(await readdir(join(remoteStateRoot, "backups"))).toEqual([]);
      expect(await readdir(join(remoteStateRoot, "recovery"))).toEqual([]);
    } finally {
      await rm(localDataRoot, { recursive: true, force: true });
      await rm(remoteRuntimeRoot, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-STATE-012B] failed incoming promotion restores the rotated live state", async () => {
    const localDataRoot = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-local-"));
    const remoteRuntimeRoot = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-remote-"));
    const remoteStateRoot = join(remoteRuntimeRoot, "state");

    try {
      await mkdir(join(localDataRoot, "pglite"), { recursive: true });
      await mkdir(join(localDataRoot, "source-links"), { recursive: true });
      await mkdir(join(localDataRoot, "server-applied-routes"), { recursive: true });
      await writeFile(join(localDataRoot, "pglite", "local.txt"), "local-state");
      await writeFile(join(localDataRoot, "pglite", "PG_VERSION"), "18\n");
      await mkdir(join(remoteStateRoot, "pglite"), { recursive: true });
      await mkdir(join(remoteStateRoot, "source-links"), { recursive: true });
      await mkdir(join(remoteStateRoot, "server-applied-routes"), { recursive: true });
      await writeFile(join(remoteStateRoot, "pglite", "live.txt"), "authoritative-state");
      await writeFile(join(remoteStateRoot, "sync-revision.txt"), "0\n");

      const baseRunner = createLocalSshArchiveRunner();
      const sync = new RemotePgliteArchiveSync(
        {
          dataRoot: remoteStateRoot,
          localDataRoot,
          localPgliteDataDir: join(localDataRoot, "pglite"),
          backupRetentionDays: 7,
          backupMaxCount: 20,
          target: {
            host: "127.0.0.1",
          },
        },
        {
          run(input) {
            if (input.command !== "ssh") return baseRunner.run(input);
            const remoteCommand = input.args
              .at(-1)
              ?.replace('mv "$incoming_dir/source-links" "$data_root/source-links"', "false");
            return baseRunner.run({
              ...input,
              args: [...input.args.slice(0, -1), remoteCommand ?? "false"],
            });
          },
        },
      );

      const uploaded = await sync.syncToRemote();

      expect(uploaded.isErr()).toBe(true);
      expect(await readFile(join(remoteStateRoot, "pglite", "live.txt"), "utf8")).toBe(
        "authoritative-state",
      );
      expect(await readFile(join(remoteStateRoot, "sync-revision.txt"), "utf8")).toBe("0\n");
      expect(await readdir(join(remoteStateRoot, "backups"))).toEqual([]);
      expect(await readdir(join(remoteStateRoot, "recovery"))).toEqual([]);
      expect(
        (await readdir(remoteStateRoot)).filter((name) => name.startsWith(".incoming-sync-")),
      ).toEqual([]);
    } finally {
      await rm(localDataRoot, { recursive: true, force: true });
      await rm(remoteRuntimeRoot, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-STATE-012C][CONFIG-FILE-STATE-012D] revision failure and signal interruption roll back the transaction", async () => {
    const cases = [
      {
        name: "revision commit failure",
        target: 'mv "$revision_temp" "$revision_file"',
        replacement: "false",
      },
      {
        name: "signal during live rotation",
        target: 'mv "$data_root/source-links" "$backup_dir/source-links"',
        replacement: "kill -TERM $$",
      },
    ];

    for (const failureCase of cases) {
      const localDataRoot = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-local-"));
      const remoteRuntimeRoot = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-remote-"));
      const remoteStateRoot = join(remoteRuntimeRoot, "state");

      try {
        await mkdir(join(localDataRoot, "pglite"), { recursive: true });
        await mkdir(join(localDataRoot, "source-links"), { recursive: true });
        await mkdir(join(localDataRoot, "server-applied-routes"), { recursive: true });
        await writeFile(join(localDataRoot, "pglite", "local.txt"), "local-state");
        await mkdir(join(remoteStateRoot, "pglite"), { recursive: true });
        await mkdir(join(remoteStateRoot, "source-links"), { recursive: true });
        await mkdir(join(remoteStateRoot, "server-applied-routes"), { recursive: true });
        await writeFile(join(remoteStateRoot, "pglite", "live.txt"), "authoritative-state");
        await writeFile(join(remoteStateRoot, "source-links", "live.txt"), "source-links-state");
        await writeFile(join(remoteStateRoot, "server-applied-routes", "live.txt"), "routes-state");
        await writeFile(join(remoteStateRoot, "sync-revision.txt"), "0\n");

        const baseRunner = createLocalSshArchiveRunner();
        const sync = new RemotePgliteArchiveSync(
          {
            dataRoot: remoteStateRoot,
            localDataRoot,
            localPgliteDataDir: join(localDataRoot, "pglite"),
            backupRetentionDays: 7,
            backupMaxCount: 20,
            target: {
              host: "127.0.0.1",
            },
          },
          {
            run(input) {
              if (input.command !== "ssh") return baseRunner.run(input);
              const original = input.args.at(-1) ?? "";
              expect(original, failureCase.name).toContain(failureCase.target);
              return baseRunner.run({
                ...input,
                args: [
                  ...input.args.slice(0, -1),
                  original.replace(failureCase.target, failureCase.replacement),
                ],
              });
            },
          },
        );

        const uploaded = await sync.syncToRemote();

        expect(uploaded.isErr(), failureCase.name).toBe(true);
        expect(
          await readFile(join(remoteStateRoot, "pglite", "live.txt"), "utf8"),
          failureCase.name,
        ).toBe("authoritative-state");
        expect(
          await readFile(join(remoteStateRoot, "source-links", "live.txt"), "utf8"),
          failureCase.name,
        ).toBe("source-links-state");
        expect(
          await readFile(join(remoteStateRoot, "server-applied-routes", "live.txt"), "utf8"),
          failureCase.name,
        ).toBe("routes-state");
        expect(
          await readFile(join(remoteStateRoot, "sync-revision.txt"), "utf8"),
          failureCase.name,
        ).toBe("0\n");
        expect(await readdir(join(remoteStateRoot, "backups")), failureCase.name).toEqual([]);
        expect(await readdir(join(remoteStateRoot, "recovery")), failureCase.name).toEqual([]);
        expect(
          (await readdir(remoteStateRoot)).filter((name) => name.startsWith(".incoming-sync-")),
          failureCase.name,
        ).toEqual([]);
      } finally {
        await rm(localDataRoot, { recursive: true, force: true });
        await rm(remoteRuntimeRoot, { recursive: true, force: true });
      }
    }
  });

  test("[CONFIG-FILE-STATE-012E] explicit retry resolves a v2 partial rotation without local pending state", async () => {
    const localDataRoot = await mkdtemp(join(tmpdir(), "appaloft-v2-recovery-local-"));
    const remoteRuntimeRoot = await mkdtemp(join(tmpdir(), "appaloft-v2-recovery-remote-"));
    const remoteStateRoot = join(remoteRuntimeRoot, "state");
    const backupName = "sync-20260823010101-42";
    const incomingName = ".incoming-sync-20260823010101-42";
    const revisionTempName = ".sync-revision-sync-20260823010101-42.tmp";
    try {
      await mkdir(join(remoteStateRoot, "backups", backupName, "pglite"), { recursive: true });
      await mkdir(join(remoteStateRoot, "source-links"), { recursive: true });
      await mkdir(join(remoteStateRoot, "server-applied-routes"), { recursive: true });
      await mkdir(join(remoteStateRoot, incomingName, "pglite"), { recursive: true });
      await mkdir(join(remoteStateRoot, incomingName, "source-links"), { recursive: true });
      await mkdir(join(remoteStateRoot, incomingName, "server-applied-routes"), {
        recursive: true,
      });
      await mkdir(join(remoteStateRoot, "recovery"), { recursive: true });
      await writeFile(join(remoteStateRoot, "backups", backupName, "pglite", "PG_VERSION"), "18\n");
      await writeFile(join(remoteStateRoot, "backups", backupName, "pglite", "live.txt"), "old");
      await writeFile(join(remoteStateRoot, "source-links", "live.txt"), "old-links");
      await writeFile(join(remoteStateRoot, "server-applied-routes", "live.txt"), "old-routes");
      await writeFile(join(remoteStateRoot, "sync-revision.txt"), "4\n");
      await writeFile(join(remoteStateRoot, revisionTempName), "5\n");
      await writeFile(
        join(remoteStateRoot, "recovery", "remote-sync-upload.json"),
        `${JSON.stringify({
          schemaVersion: "remote-state-sync-recovery/v2",
          status: "active",
          transactionId: backupName,
          backupName,
          incomingName,
          revisionTempName,
          expectedRevision: 4,
          nextRevision: 5,
          hadPglite: true,
          hadSourceLinks: true,
          hadServerAppliedRoutes: true,
        })}\n`,
      );

      const prepared = await prepareRemotePgliteStateSync({
        argv: [
          "appaloft",
          "server",
          "capacity",
          "inspect",
          "srv_primary",
          "--state-backend",
          "ssh-pglite",
          "--server-host",
          "127.0.0.1",
          "--retry-pending-state-sync",
        ],
        config: testConfig(localDataRoot, { remoteRuntimeRoot }),
        runner: createLocalSshArchiveRunner(),
      });

      if (prepared.isErr()) throw new Error(JSON.stringify(prepared.error));
      expect(prepared.isOk()).toBe(true);
      if (!prepared.value) throw new Error("Expected recovered session");
      expect(await readFile(join(remoteStateRoot, "pglite", "live.txt"), "utf8")).toBe("old");
      expect(await readFile(join(remoteStateRoot, "source-links", "live.txt"), "utf8")).toBe(
        "old-links",
      );
      expect(
        await Bun.file(join(remoteStateRoot, "recovery", "remote-sync-upload.json")).exists(),
      ).toBe(false);
      expect(await Bun.file(join(remoteStateRoot, incomingName)).exists()).toBe(false);
      expect(await Bun.file(join(remoteStateRoot, revisionTempName)).exists()).toBe(false);
      expect((await prepared.value.discardAndRelease()).isOk()).toBe(true);
    } finally {
      await rm(localDataRoot, { recursive: true, force: true });
      await rm(remoteRuntimeRoot, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-STATE-012F] legacy v1 recovery is strict, resumable, and fail closed", async () => {
    const localDataRoot = await mkdtemp(join(tmpdir(), "appaloft-v1-recovery-local-"));
    const remoteRuntimeRoot = await mkdtemp(join(tmpdir(), "appaloft-v1-recovery-remote-"));
    const remoteStateRoot = join(remoteRuntimeRoot, "state");
    const backupRoot = join(remoteStateRoot, "backups", "sync-legacy-42");
    const sync = new RemotePgliteArchiveSync(
      {
        dataRoot: remoteStateRoot,
        localDataRoot,
        localPgliteDataDir: join(localDataRoot, "pglite"),
        backupRetentionDays: 7,
        backupMaxCount: 20,
        target: { host: "127.0.0.1" },
      },
      createLocalSshArchiveRunner(),
    );
    try {
      for (const component of ["pglite", "source-links", "server-applied-routes"]) {
        await mkdir(join(backupRoot, component), { recursive: true });
        await mkdir(join(remoteStateRoot, component), { recursive: true });
        await writeFile(join(backupRoot, component, "state.txt"), `old-${component}`);
        await writeFile(join(remoteStateRoot, component, "state.txt"), `new-${component}`);
      }
      await writeFile(join(backupRoot, "pglite", "PG_VERSION"), "18\n");
      await mkdir(join(remoteStateRoot, "recovery"), { recursive: true });
      const markerPath = join(remoteStateRoot, "recovery", "remote-sync-upload.json");
      await writeFile(
        markerPath,
        `${JSON.stringify({ phase: "remote-state-sync-upload", backup: backupRoot })}\n`,
      );

      expect(sync.recoverRemoteTransaction().isOk()).toBe(true);
      expect(await readFile(join(remoteStateRoot, "pglite", "state.txt"), "utf8")).toBe(
        "old-pglite",
      );
      expect(await Bun.file(markerPath).exists()).toBe(false);

      await writeFile(
        markerPath,
        `${JSON.stringify({
          phase: "remote-state-sync-legacy-recovery",
          backup: backupRoot,
        })}\n`,
      );
      expect(sync.recoverRemoteTransaction().isErr()).toBe(true);
      expect(await Bun.file(markerPath).exists()).toBe(true);

      await writeFile(markerPath, '{"phase":"promotion","backup":"/tmp/not-authoritative"}\n');
      expect(sync.recoverRemoteTransaction().isErr()).toBe(true);
      expect(await Bun.file(markerPath).exists()).toBe(true);
      expect(await readFile(join(remoteStateRoot, "pglite", "state.txt"), "utf8")).toBe(
        "old-pglite",
      );

      await mkdir(join(backupRoot, "pglite"), { recursive: true });
      await writeFile(join(backupRoot, "pglite", "PG_VERSION"), "18\n");
      await writeFile(join(backupRoot, "pglite", "state.txt"), "incomplete-old-pglite");
      await writeFile(
        markerPath,
        `${JSON.stringify({ phase: "remote-state-sync-upload", backup: backupRoot })}\n`,
      );
      expect(sync.recoverRemoteTransaction().isErr()).toBe(true);
      expect(await Bun.file(markerPath).exists()).toBe(true);
      expect(await readFile(join(remoteStateRoot, "pglite", "state.txt"), "utf8")).toBe(
        "old-pglite",
      );
    } finally {
      await rm(localDataRoot, { recursive: true, force: true });
      await rm(remoteRuntimeRoot, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-STATE-012F] legacy recovery retries from the complete backup after an interrupted copy", async () => {
    const localDataRoot = await mkdtemp(join(tmpdir(), "appaloft-v1-retry-local-"));
    const remoteRuntimeRoot = await mkdtemp(join(tmpdir(), "appaloft-v1-retry-remote-"));
    const remoteStateRoot = join(remoteRuntimeRoot, "state");
    const backupRoot = join(remoteStateRoot, "backups", "sync-legacy-retry-42");
    const markerPath = join(remoteStateRoot, "recovery", "remote-sync-upload.json");

    try {
      for (const component of ["pglite", "source-links", "server-applied-routes"]) {
        await mkdir(join(backupRoot, component), { recursive: true });
        await mkdir(join(remoteStateRoot, component), { recursive: true });
        await writeFile(join(backupRoot, component, "state.txt"), `old-${component}`);
        await writeFile(join(remoteStateRoot, component, "state.txt"), `partial-${component}`);
      }
      await writeFile(join(backupRoot, "pglite", "PG_VERSION"), "18\n");
      await mkdir(join(remoteStateRoot, "recovery"), { recursive: true });
      await writeFile(join(remoteStateRoot, "sync-revision.txt"), "4\n");
      await writeFile(
        markerPath,
        `${JSON.stringify({ phase: "remote-state-sync-upload", backup: backupRoot })}\n`,
      );

      const baseRunner = createLocalSshArchiveRunner();
      const interruptedSync = new RemotePgliteArchiveSync(
        {
          dataRoot: remoteStateRoot,
          localDataRoot,
          localPgliteDataDir: join(localDataRoot, "pglite"),
          backupRetentionDays: 7,
          backupMaxCount: 20,
          target: { host: "127.0.0.1" },
        },
        {
          run(input) {
            if (input.command !== "ssh") return baseRunner.run(input);
            const original = input.args.at(-1) ?? "";
            const copyCommand = 'cp -a "$backup_dir/$component" "$data_root/$component" || exit 75';
            expect(original).toContain(copyCommand);
            return baseRunner.run({
              ...input,
              args: [
                ...input.args.slice(0, -1),
                original.replace(
                  copyCommand,
                  'if [ "$component" = source-links ]; then false; else cp -a "$backup_dir/$component" "$data_root/$component"; fi || exit 75',
                ),
              ],
            });
          },
        },
      );

      expect(interruptedSync.recoverRemoteTransaction().isErr()).toBe(true);
      expect(await Bun.file(markerPath).exists()).toBe(true);
      expect(await readFile(join(backupRoot, "pglite", "state.txt"), "utf8")).toBe("old-pglite");
      expect(await readFile(join(backupRoot, "source-links", "state.txt"), "utf8")).toBe(
        "old-source-links",
      );

      const retriedSync = new RemotePgliteArchiveSync(
        {
          dataRoot: remoteStateRoot,
          localDataRoot,
          localPgliteDataDir: join(localDataRoot, "pglite"),
          backupRetentionDays: 7,
          backupMaxCount: 20,
          target: { host: "127.0.0.1" },
        },
        baseRunner,
      );

      expect(retriedSync.recoverRemoteTransaction().isOk()).toBe(true);
      for (const component of ["pglite", "source-links", "server-applied-routes"]) {
        expect(await readFile(join(remoteStateRoot, component, "state.txt"), "utf8")).toBe(
          `old-${component}`,
        );
      }
      expect(await Bun.file(markerPath).exists()).toBe(false);
      expect(await Bun.file(backupRoot).exists()).toBe(false);
    } finally {
      await rm(localDataRoot, { recursive: true, force: true });
      await rm(remoteRuntimeRoot, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-STATE-012E] a committed v2 marker reclaims staging before durability sync without rolling data back", async () => {
    const localDataRoot = await mkdtemp(join(tmpdir(), "appaloft-v2-commit-local-"));
    const remoteRuntimeRoot = await mkdtemp(join(tmpdir(), "appaloft-v2-commit-remote-"));
    const remoteStateRoot = join(remoteRuntimeRoot, "state");
    const transactionId = "sync-20260823020202-43";
    const backupRoot = join(remoteStateRoot, "backups", transactionId);
    const incomingName = `.incoming-${transactionId}`;
    const revisionTempName = `.sync-revision-${transactionId}.tmp`;
    try {
      for (const component of ["pglite", "source-links", "server-applied-routes"]) {
        await mkdir(join(remoteStateRoot, component), { recursive: true });
        await mkdir(join(backupRoot, component), { recursive: true });
        await writeFile(join(remoteStateRoot, component, "state.txt"), `committed-${component}`);
        await writeFile(join(backupRoot, component, "state.txt"), `previous-${component}`);
      }
      await mkdir(join(remoteStateRoot, incomingName), { recursive: true });
      await mkdir(join(remoteStateRoot, "recovery"), { recursive: true });
      await writeFile(join(remoteStateRoot, "sync-revision.txt"), "5\n");
      await writeFile(join(remoteStateRoot, revisionTempName), "5\n");
      const markerPath = join(remoteStateRoot, "recovery", "remote-sync-upload.json");
      await writeFile(
        markerPath,
        `${JSON.stringify({
          schemaVersion: "remote-state-sync-recovery/v2",
          status: "active",
          transactionId,
          backupName: transactionId,
          incomingName,
          revisionTempName,
          expectedRevision: 4,
          nextRevision: 5,
          hadPglite: true,
          hadSourceLinks: true,
          hadServerAppliedRoutes: true,
        })}\n`,
      );
      const baseRunner = createLocalSshArchiveRunner();
      const sync = new RemotePgliteArchiveSync(
        {
          dataRoot: remoteStateRoot,
          localDataRoot,
          localPgliteDataDir: join(localDataRoot, "pglite"),
          backupRetentionDays: 7,
          backupMaxCount: 20,
          target: { host: "127.0.0.1" },
        },
        {
          run(input) {
            if (input.command !== "ssh") return baseRunner.run(input);
            const original = input.args.at(-1) ?? "";
            const durabilitySync = 'sync_path "$data_root" || exit 75';
            expect(original).toContain(durabilitySync);
            return baseRunner.run({
              ...input,
              args: [
                ...input.args.slice(0, -1),
                original.replaceAll(
                  durabilitySync,
                  `[ ! -d "$incoming_dir" ] || exit 75\n      ${durabilitySync}`,
                ),
              ],
            });
          },
        },
      );

      expect(sync.recoverRemoteTransaction().isOk()).toBe(true);
      expect(await readFile(join(remoteStateRoot, "pglite", "state.txt"), "utf8")).toBe(
        "committed-pglite",
      );
      expect(await readFile(join(backupRoot, "pglite", "state.txt"), "utf8")).toBe(
        "previous-pglite",
      );
      expect(await Bun.file(markerPath).exists()).toBe(false);
      expect(await Bun.file(join(remoteStateRoot, incomingName)).exists()).toBe(false);
      expect(await Bun.file(join(remoteStateRoot, revisionTempName)).exists()).toBe(false);

      await rm(join(remoteStateRoot, "source-links"), { recursive: true });
      await mkdir(join(remoteStateRoot, incomingName));
      await writeFile(join(remoteStateRoot, revisionTempName), "5\n");
      await writeFile(
        markerPath,
        `${JSON.stringify({
          schemaVersion: "remote-state-sync-recovery/v2",
          status: "active",
          transactionId,
          backupName: transactionId,
          incomingName,
          revisionTempName,
          expectedRevision: 4,
          nextRevision: 5,
          hadPglite: true,
          hadSourceLinks: true,
          hadServerAppliedRoutes: true,
        })}\n`,
      );
      expect(sync.recoverRemoteTransaction().isErr()).toBe(true);
      expect(await Bun.file(markerPath).exists()).toBe(true);
      expect(await readFile(join(remoteStateRoot, "pglite", "state.txt"), "utf8")).toBe(
        "committed-pglite",
      );
    } finally {
      await rm(localDataRoot, { recursive: true, force: true });
      await rm(remoteRuntimeRoot, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-STATE-013] upload prunes only old sync backup archives within the configured recovery window", async () => {
    const localDataRoot = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-local-"));
    const remoteRuntimeRoot = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-remote-"));
    const remoteStateRoot = join(remoteRuntimeRoot, "state");
    const oldBackup = join(remoteStateRoot, "backups", "sync-20200101000000-old");
    const recentBackup = join(remoteStateRoot, "backups", "sync-20990101000000-recent");
    const manualBackup = join(remoteStateRoot, "backups", "manual-keep");

    try {
      await mkdir(join(localDataRoot, "pglite"), { recursive: true });
      await mkdir(join(localDataRoot, "source-links"), { recursive: true });
      await mkdir(join(localDataRoot, "server-applied-routes"), { recursive: true });
      await writeFile(join(localDataRoot, "pglite", "local.txt"), "local-state");
      await writeFile(join(localDataRoot, "pglite", "PG_VERSION"), "18\n");
      await mkdir(join(remoteStateRoot, "pglite"), { recursive: true });
      await mkdir(join(remoteStateRoot, "source-links"), { recursive: true });
      await mkdir(join(remoteStateRoot, "server-applied-routes"), { recursive: true });
      await mkdir(join(remoteStateRoot, "locks", "mutation.lock"), { recursive: true });
      await mkdir(oldBackup, { recursive: true });
      await mkdir(recentBackup, { recursive: true });
      await mkdir(manualBackup, { recursive: true });
      await writeFile(join(remoteStateRoot, "sync-revision.txt"), "0\n");
      await writeFile(join(remoteStateRoot, "pglite", "remote.txt"), "remote-state");
      await writeFile(join(oldBackup, "pglite.txt"), "old backup");
      await writeFile(join(recentBackup, "pglite.txt"), "recent backup");
      await writeFile(join(manualBackup, "pglite.txt"), "manual backup");
      const oldDate = new Date("2020-01-01T00:00:00.000Z");
      const recentDate = new Date();
      await utimes(oldBackup, oldDate, oldDate);
      await utimes(recentBackup, recentDate, recentDate);

      const sync = new RemotePgliteArchiveSync(
        {
          dataRoot: remoteStateRoot,
          localDataRoot,
          localPgliteDataDir: join(localDataRoot, "pglite"),
          backupRetentionDays: 1,
          backupMaxCount: 20,
          target: {
            host: "127.0.0.1",
          },
        },
        createLocalSshArchiveRunner(),
      );

      const uploaded = await sync.syncToRemote();
      const backups = await readdir(join(remoteStateRoot, "backups"));

      if (uploaded.isErr()) throw new Error(JSON.stringify(uploaded.error));
      expect(uploaded.isOk()).toBe(true);
      expect(backups).not.toContain("sync-20200101000000-old");
      expect(backups).toContain("sync-20990101000000-recent");
      expect(backups).toContain("manual-keep");
      expect(await readFile(join(remoteStateRoot, "pglite", "local.txt"), "utf8")).toBe(
        "local-state",
      );
      expect(await readFile(join(remoteStateRoot, "sync-revision.txt"), "utf8")).toBe("1\n");
    } finally {
      await rm(localDataRoot, { recursive: true, force: true });
      await rm(remoteRuntimeRoot, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-STATE-013] upload caps sync backup archive count within the recovery window", async () => {
    const localDataRoot = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-local-"));
    const remoteRuntimeRoot = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-remote-"));
    const remoteStateRoot = join(remoteRuntimeRoot, "state");
    const backupRoot = join(remoteStateRoot, "backups");
    const oldestBackup = join(backupRoot, "sync-20990101000000-oldest");
    const middleBackup = join(backupRoot, "sync-20990101000100-middle");
    const newestBackup = join(backupRoot, "sync-20990101000200-newest");
    const manualBackup = join(backupRoot, "manual-keep");

    try {
      await mkdir(join(localDataRoot, "pglite"), { recursive: true });
      await mkdir(join(localDataRoot, "source-links"), { recursive: true });
      await mkdir(join(localDataRoot, "server-applied-routes"), { recursive: true });
      await writeFile(join(localDataRoot, "pglite", "local.txt"), "local-state");
      await writeFile(join(localDataRoot, "pglite", "PG_VERSION"), "18\n");
      await mkdir(join(remoteStateRoot, "pglite"), { recursive: true });
      await mkdir(join(remoteStateRoot, "source-links"), { recursive: true });
      await mkdir(join(remoteStateRoot, "server-applied-routes"), { recursive: true });
      await mkdir(oldestBackup, { recursive: true });
      await mkdir(middleBackup, { recursive: true });
      await mkdir(newestBackup, { recursive: true });
      await mkdir(manualBackup, { recursive: true });
      await writeFile(join(remoteStateRoot, "sync-revision.txt"), "0\n");
      await writeFile(join(remoteStateRoot, "pglite", "remote.txt"), "remote-state");

      const now = Date.now();
      await utimes(oldestBackup, new Date(now - 180_000), new Date(now - 180_000));
      await utimes(middleBackup, new Date(now - 120_000), new Date(now - 120_000));
      await utimes(newestBackup, new Date(now - 60_000), new Date(now - 60_000));

      const sync = new RemotePgliteArchiveSync(
        {
          dataRoot: remoteStateRoot,
          localDataRoot,
          localPgliteDataDir: join(localDataRoot, "pglite"),
          backupRetentionDays: 30,
          backupMaxCount: 2,
          target: {
            host: "127.0.0.1",
          },
        },
        createLocalSshArchiveRunner(),
      );

      const uploaded = await sync.syncToRemote();
      const backups = await readdir(backupRoot);
      const syncBackups = backups.filter((name) => name.startsWith("sync-"));

      if (uploaded.isErr()) throw new Error(JSON.stringify(uploaded.error));
      expect(uploaded.isOk()).toBe(true);
      expect(syncBackups).toHaveLength(2);
      expect(backups).not.toContain("sync-20990101000000-oldest");
      expect(backups).not.toContain("sync-20990101000100-middle");
      expect(backups).toContain("manual-keep");
    } finally {
      await rm(localDataRoot, { recursive: true, force: true });
      await rm(remoteRuntimeRoot, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-STATE-012G] retention rejects unsafe sync backup names without word splitting", async () => {
    const localDataRoot = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-local-"));
    const remoteRuntimeRoot = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-remote-"));
    const remoteStateRoot = join(remoteRuntimeRoot, "state");
    const unsafeBackup = join(remoteStateRoot, "backups", "sync-unsafe name");

    try {
      await mkdir(join(localDataRoot, "pglite"), { recursive: true });
      await mkdir(join(localDataRoot, "source-links"), { recursive: true });
      await mkdir(join(localDataRoot, "server-applied-routes"), { recursive: true });
      await writeFile(join(localDataRoot, "pglite", "PG_VERSION"), "18\n");
      await writeFile(join(localDataRoot, "pglite", "local.txt"), "local-state");
      await mkdir(join(remoteStateRoot, "pglite"), { recursive: true });
      await mkdir(join(remoteStateRoot, "source-links"), { recursive: true });
      await mkdir(join(remoteStateRoot, "server-applied-routes"), { recursive: true });
      await mkdir(unsafeBackup, { recursive: true });
      await writeFile(join(unsafeBackup, "keep.txt"), "keep");
      await writeFile(join(remoteStateRoot, "pglite", "live.txt"), "authoritative-state");
      await writeFile(join(remoteStateRoot, "sync-revision.txt"), "0\n");

      const sync = new RemotePgliteArchiveSync(
        {
          dataRoot: remoteStateRoot,
          localDataRoot,
          localPgliteDataDir: join(localDataRoot, "pglite"),
          backupRetentionDays: 7,
          backupMaxCount: 20,
          target: { host: "127.0.0.1" },
        },
        createLocalSshArchiveRunner(),
      );

      const uploaded = await sync.syncToRemote();

      expect(uploaded.isErr()).toBe(true);
      expect(await readFile(join(remoteStateRoot, "pglite", "live.txt"), "utf8")).toBe(
        "authoritative-state",
      );
      expect(await readFile(join(unsafeBackup, "keep.txt"), "utf8")).toBe("keep");
      expect(await readFile(join(remoteStateRoot, "sync-revision.txt"), "utf8")).toBe("0\n");
    } finally {
      await rm(localDataRoot, { recursive: true, force: true });
      await rm(remoteRuntimeRoot, { recursive: true, force: true });
    }
  });

  test("[DEPLOYMENTS-CLEANUP-PREVIEW-010] preview cleanup remote session preserves standalone SSH live PGlite state", async () => {
    const localDataRoot = await mkdtemp(join(tmpdir(), "appaloft-preview-cleanup-local-"));
    const remoteRuntimeRoot = await mkdtemp(join(tmpdir(), "appaloft-preview-cleanup-remote-"));
    const remoteStateRoot = join(remoteRuntimeRoot, "state");

    try {
      await mkdir(join(remoteStateRoot, "pglite"), { recursive: true });
      await mkdir(join(remoteStateRoot, "source-links"), { recursive: true });
      await mkdir(join(remoteStateRoot, "server-applied-routes"), { recursive: true });
      await writeFile(join(remoteStateRoot, "pglite", "live.txt"), "standalone-live-state");
      await writeFile(join(remoteStateRoot, "pglite", "PG_VERSION"), "18\n");
      await writeFile(join(remoteStateRoot, "source-links", "other.json"), "{}\n");
      await writeFile(join(remoteStateRoot, "server-applied-routes", "other.json"), "{}\n");
      await writeFile(join(remoteStateRoot, "sync-revision.txt"), "0\n");

      const session = await prepareRemotePgliteStateSync({
        argv: [
          "appaloft",
          "preview",
          "cleanup",
          ".",
          "--preview",
          "pull-request",
          "--preview-id",
          "pr-17",
          "--server-host",
          "127.0.0.1",
        ],
        config: testConfig(localDataRoot, { remoteRuntimeRoot }),
        runner: createLocalSshArchiveRunner(),
      });

      expect(session.isOk()).toBe(true);
      if (session.isErr() || !session.value) {
        throw new Error("Expected remote preview cleanup sync session");
      }

      const released = await session.value.releaseForCliRuntime();
      const synced = await session.value.syncBackAndRelease();

      expect(released.isOk()).toBe(true);
      expect(synced.isOk()).toBe(true);
      expect(await readFile(join(remoteStateRoot, "pglite", "live.txt"), "utf8")).toBe(
        "standalone-live-state",
      );
      expect(await readFile(join(remoteStateRoot, "source-links", "other.json"), "utf8")).toBe(
        "{}\n",
      );
      expect(
        await readFile(join(remoteStateRoot, "server-applied-routes", "other.json"), "utf8"),
      ).toBe("{}\n");
      expect(
        JSON.parse(await readFile(join(remoteStateRoot, "backend.json"), "utf8")),
      ).toMatchObject({
        schemaVersion: "server-state-backend/v1",
        stateBackend: "ssh-pglite",
      });
    } finally {
      await rm(localDataRoot, { recursive: true, force: true });
      await rm(remoteRuntimeRoot, { recursive: true, force: true });
    }
  });

  test("[RT-CAP-REMOTE-011] failed destructive sync preserves and explicitly retries pending audit state", async () => {
    const localDataRoot = await mkdtemp(join(tmpdir(), "appaloft-capacity-recovery-local-"));
    const remoteRuntimeRoot = await mkdtemp(join(tmpdir(), "appaloft-capacity-recovery-remote-"));
    const remoteStateRoot = join(remoteRuntimeRoot, "state");
    const baseRunner = createLocalSshArchiveRunner();
    let failUpload = true;
    let failRelease = false;
    let uploadAttempts = 0;
    let mirrorSwap: { from: string; to: string } | null = null;
    const runner = {
      run(input: RemotePgliteArchiveRunnerInput) {
        if (mirrorSwap && input.command === "tar") {
          renameSync(mirrorSwap.from, mirrorSwap.to);
          mirrorSwap = null;
        }
        if (failRelease && isRemoteMutationLockRelease(input)) {
          return {
            exitCode: 1,
            stdout: new Uint8Array(),
            stderr: "simulated lock release failure",
            failed: true,
          };
        }
        if (input.command === "ssh" && input.args.at(-1)?.includes("expected_revision")) {
          uploadAttempts += 1;
          if (!failUpload) return baseRunner.run(input);
          return {
            exitCode: 1,
            stdout: new Uint8Array(),
            stderr: "No space left on device",
            failed: true,
          };
        }
        return baseRunner.run(input);
      },
    };
    const commonArgs = [
      "appaloft",
      "server",
      "capacity",
      "prune",
      "srv_primary",
      "--before",
      "2026-01-01T00:00:00.000Z",
      "--dry-run",
      "false",
      "--state-backend",
      "ssh-pglite",
      "--server-host",
      "127.0.0.1",
    ];

    try {
      await mkdir(join(remoteStateRoot, "pglite"), { recursive: true });
      await mkdir(join(remoteStateRoot, "source-links"), { recursive: true });
      await mkdir(join(remoteStateRoot, "server-applied-routes"), { recursive: true });
      await mkdir(join(remoteStateRoot, "locks"), { recursive: true });
      await writeFile(join(remoteStateRoot, "schema-version.json"), '{"version":1}\n');
      await writeFile(join(remoteStateRoot, "sync-revision.txt"), "0\n");
      await writeFile(join(remoteStateRoot, "pglite", "live.txt"), "remote-live-state");
      await writeFile(join(remoteStateRoot, "pglite", "PG_VERSION"), "18\n");

      const session = await prepareRemotePgliteStateSync({
        argv: commonArgs,
        config: testConfig(localDataRoot, { remoteRuntimeRoot }),
        runner,
      });
      expect(session.isOk()).toBe(true);
      if (session.isErr() || !session.value) throw new Error("Expected destructive sync session");

      expect((await session.value.releaseForCliRuntime()).isOk()).toBe(true);
      await writeFile(join(session.value.localPgliteDataDir, "audit.txt"), "capacity-prune-audit");
      failRelease = true;
      const failedSync = await session.value.syncBackAndRelease();
      expect(failedSync._unsafeUnwrapErr().details).toMatchObject({
        phase: "remote-state-sync-upload",
        recoveryPhase: "remote-state-sync-recovery",
        recoveryAction: "run-capacity-inspect-with---retry-pending-state-sync",
      });
      const pendingPath = join(session.value.localDataRoot, "recovery", "pending-sync.json");
      expect(await Bun.file(pendingPath).exists()).toBe(true);
      expect(await Bun.file(join(remoteStateRoot, "pglite", "audit.txt")).exists()).toBe(false);
      expect(uploadAttempts).toBe(1);

      const inspectRecoveryArgs = [
        "appaloft",
        "server",
        "capacity",
        "inspect",
        "srv_primary",
        "--state-backend",
        "ssh-pglite",
        "--server-host",
        "127.0.0.1",
        "--retry-pending-state-sync",
      ];
      const mismatchedTargetRecovery = await prepareRemotePgliteStateSync({
        argv: inspectRecoveryArgs.map((value) => (value === "127.0.0.1" ? "127.0.0.2" : value)),
        env: { APPALOFT_PGLITE_DATA_DIR: session.value.localPgliteDataDir },
        config: testConfig(localDataRoot, { remoteRuntimeRoot }),
        runner,
      });
      expect(mismatchedTargetRecovery._unsafeUnwrapErr().details).toMatchObject({
        phase: "remote-state-sync-recovery",
        reason: "remote_state_pending_sync_target_mismatch",
      });
      expect(uploadAttempts).toBe(1);

      const originalPendingText = await readFile(pendingPath, "utf8");
      const originalPending = JSON.parse(originalPendingText) as Record<string, unknown>;
      expect(
        (await readdir(join(session.value.localDataRoot, "recovery"))).filter((name) =>
          name.startsWith("pending-sync.json.tmp-"),
        ),
      ).toEqual([]);
      await writeFile(
        pendingPath,
        `${JSON.stringify({ ...originalPending, expectedRevision: -1, nextRevision: 0 })}\n`,
      );
      const invalidRevisionRecovery = await prepareRemotePgliteStateSync({
        argv: inspectRecoveryArgs,
        config: testConfig(localDataRoot, { remoteRuntimeRoot }),
        runner,
      });
      expect(invalidRevisionRecovery._unsafeUnwrapErr().details).toMatchObject({
        reason: "remote_state_pending_sync_invalid",
      });
      expect(uploadAttempts).toBe(1);

      await writeFile(
        pendingPath,
        `${JSON.stringify({
          ...originalPending,
          baseSnapshotRoot: `${session.value.localDataRoot}.base-near-prefix`,
        })}\n`,
      );
      const invalidPathRecovery = await prepareRemotePgliteStateSync({
        argv: inspectRecoveryArgs,
        config: testConfig(localDataRoot, { remoteRuntimeRoot }),
        runner,
      });
      expect(invalidPathRecovery._unsafeUnwrapErr().details).toMatchObject({
        reason: "remote_state_pending_sync_path_invalid",
      });
      expect(uploadAttempts).toBe(1);

      await writeFile(pendingPath, "{");
      const partialMarkerRecovery = await prepareRemotePgliteStateSync({
        argv: inspectRecoveryArgs,
        config: testConfig(localDataRoot, { remoteRuntimeRoot }),
        runner,
      });
      expect(partialMarkerRecovery._unsafeUnwrapErr().details).toMatchObject({
        reason: "remote_state_pending_sync_invalid",
      });
      expect(uploadAttempts).toBe(1);

      await writeFile(pendingPath, originalPendingText);
      const preservedPgliteRoot = `${session.value.localPgliteDataDir}.preserved`;
      await rename(session.value.localPgliteDataDir, preservedPgliteRoot);
      const missingMirrorRecovery = await prepareRemotePgliteStateSync({
        argv: inspectRecoveryArgs,
        config: testConfig(localDataRoot, { remoteRuntimeRoot }),
        runner,
      });
      expect(missingMirrorRecovery._unsafeUnwrapErr().details).toMatchObject({
        reason: "remote_state_pending_sync_mirror_unavailable",
      });
      expect(uploadAttempts).toBe(1);
      await rename(preservedPgliteRoot, session.value.localPgliteDataDir);

      await rm(pendingPath, { force: true });
      const unreadableOrphanRecovery = await prepareRemotePgliteStateSync({
        argv: inspectRecoveryArgs,
        config: testConfig(localDataRoot, { remoteRuntimeRoot }),
        runner,
        readDirectory: async () => {
          throw Object.assign(new Error("permission denied"), { code: "EACCES" });
        },
      });
      expect(unreadableOrphanRecovery._unsafeUnwrapErr().details).toMatchObject({
        reason: "remote_state_orphan_scan_failed",
      });
      expect(uploadAttempts).toBe(1);

      const missingMarkerRecovery = await prepareRemotePgliteStateSync({
        argv: inspectRecoveryArgs,
        config: testConfig(localDataRoot, { remoteRuntimeRoot }),
        runner,
      });
      expect(missingMarkerRecovery._unsafeUnwrapErr().details).toMatchObject({
        reason: "remote_state_orphaned_pending_sync",
      });
      expect(uploadAttempts).toBe(1);
      await writeFile(pendingPath, originalPendingText);

      const rejectedNonInspectRecovery = await prepareRemotePgliteStateSync({
        argv: [...commonArgs, "--retry-pending-state-sync"],
        config: testConfig(localDataRoot, { remoteRuntimeRoot }),
        runner,
      });
      expect(rejectedNonInspectRecovery._unsafeUnwrapErr().details).toMatchObject({
        phase: "remote-state-sync-recovery",
        reason: "remote_state_pending_sync_inspect_required",
      });
      expect(uploadAttempts).toBe(1);

      failRelease = false;
      await rm(join(remoteStateRoot, "locks", "mutation.lock"), { recursive: true, force: true });
      const racedMirrorRoot = `${session.value.localPgliteDataDir}.packing-race`;
      mirrorSwap = { from: session.value.localPgliteDataDir, to: racedMirrorRoot };
      const packingRaceRecovery = await prepareRemotePgliteStateSync({
        argv: inspectRecoveryArgs,
        config: testConfig(localDataRoot, { remoteRuntimeRoot }),
        runner,
      });
      expect(packingRaceRecovery.isErr()).toBe(true);
      expect(uploadAttempts).toBe(1);
      expect(await Bun.file(pendingPath).exists()).toBe(true);
      renameSync(racedMirrorRoot, session.value.localPgliteDataDir);

      failUpload = false;
      const recovered = await prepareRemotePgliteStateSync({
        argv: inspectRecoveryArgs,
        config: testConfig(localDataRoot, { remoteRuntimeRoot }),
        runner,
      });
      if (recovered.isErr()) {
        throw new Error(JSON.stringify(recovered.error));
      }
      expect(recovered.isOk()).toBe(true);
      if (recovered.isErr() || !recovered.value) throw new Error("Expected recovered sync session");
      expect(await readFile(join(remoteStateRoot, "pglite", "audit.txt"), "utf8")).toBe(
        "capacity-prune-audit",
      );
      expect(
        await Bun.file(
          join(recovered.value.localDataRoot, "recovery", "pending-sync.json"),
        ).exists(),
      ).toBe(false);
      expect((await recovered.value.discardAndRelease()).isOk()).toBe(true);
    } finally {
      await rm(localDataRoot, { recursive: true, force: true });
      await rm(remoteRuntimeRoot, { recursive: true, force: true });
    }
  }, 15_000);

  test("[RT-CAP-REMOTE-011] thrown destructive upload preserves recovery state and releases the mutation lock", async () => {
    const localDataRoot = await mkdtemp(join(tmpdir(), "appaloft-capacity-throw-local-"));
    const remoteRuntimeRoot = await mkdtemp(join(tmpdir(), "appaloft-capacity-throw-remote-"));
    const remoteStateRoot = join(remoteRuntimeRoot, "state");
    const baseRunner = createLocalSshArchiveRunner();
    let throwUpload = true;
    const runner = {
      run(input: RemotePgliteArchiveRunnerInput) {
        if (
          throwUpload &&
          input.command === "ssh" &&
          input.args.at(-1)?.includes("expected_revision")
        ) {
          throwUpload = false;
          throw new Error("simulated destructive archive runner interruption");
        }
        return baseRunner.run(input);
      },
    };

    try {
      await mkdir(join(remoteStateRoot, "pglite"), { recursive: true });
      await mkdir(join(remoteStateRoot, "source-links"), { recursive: true });
      await mkdir(join(remoteStateRoot, "server-applied-routes"), { recursive: true });
      await mkdir(join(remoteStateRoot, "locks"), { recursive: true });
      await writeFile(join(remoteStateRoot, "schema-version.json"), '{"version":1}\n');
      await writeFile(join(remoteStateRoot, "sync-revision.txt"), "0\n");
      await writeFile(join(remoteStateRoot, "pglite", "PG_VERSION"), "18\n");

      const session = await prepareRemotePgliteStateSync({
        argv: [
          "appaloft",
          "server",
          "capacity",
          "prune",
          "srv_primary",
          "--before",
          "2026-01-01T00:00:00.000Z",
          "--dry-run",
          "false",
          "--state-backend",
          "ssh-pglite",
          "--server-host",
          "127.0.0.1",
        ],
        config: testConfig(localDataRoot, { remoteRuntimeRoot }),
        runner,
      });
      expect(session.isOk()).toBe(true);
      if (session.isErr() || !session.value) throw new Error("Expected destructive sync session");

      expect((await session.value.releaseForCliRuntime()).isOk()).toBe(true);
      await writeFile(join(session.value.localPgliteDataDir, "audit.txt"), "preserved-audit");
      const failed = await session.value.syncBackAndRelease();
      expect(failed._unsafeUnwrapErr().details).toMatchObject({
        reason: "remote_state_sync_upload_interrupted",
        recoveryAction: "run-capacity-inspect-with---retry-pending-state-sync",
      });
      const pendingPath = join(session.value.localDataRoot, "recovery", "pending-sync.json");
      expect(await Bun.file(pendingPath).exists()).toBe(true);
      expect(await Bun.file(join(session.value.localPgliteDataDir, "audit.txt")).exists()).toBe(
        true,
      );
      expect(await Bun.file(join(remoteStateRoot, "locks", "mutation.lock")).exists()).toBe(false);
    } finally {
      await rm(localDataRoot, { recursive: true, force: true });
      await rm(remoteRuntimeRoot, { recursive: true, force: true });
    }
  });

  test("[RT-CAP-REMOTE-011] successful upload cleans transaction roots before reporting lock release failure", async () => {
    const localDataRoot = await mkdtemp(join(tmpdir(), "appaloft-capacity-release-local-"));
    const remoteRuntimeRoot = await mkdtemp(join(tmpdir(), "appaloft-capacity-release-remote-"));
    const remoteStateRoot = join(remoteRuntimeRoot, "state");
    const baseRunner = createLocalSshArchiveRunner();
    let failRelease = false;
    const runner = {
      run(input: RemotePgliteArchiveRunnerInput) {
        if (failRelease && isRemoteMutationLockRelease(input)) {
          return {
            exitCode: 1,
            stdout: new Uint8Array(),
            stderr: "simulated lock release failure after successful upload",
            failed: true,
          };
        }
        return baseRunner.run(input);
      },
    };
    const pruneArgs = [
      "appaloft",
      "server",
      "capacity",
      "prune",
      "srv_primary",
      "--before",
      "2026-01-01T00:00:00.000Z",
      "--dry-run",
      "false",
      "--state-backend",
      "ssh-pglite",
      "--server-host",
      "127.0.0.1",
    ];

    try {
      await mkdir(join(remoteStateRoot, "pglite"), { recursive: true });
      await mkdir(join(remoteStateRoot, "source-links"), { recursive: true });
      await mkdir(join(remoteStateRoot, "server-applied-routes"), { recursive: true });
      await mkdir(join(remoteStateRoot, "locks"), { recursive: true });
      await writeFile(join(remoteStateRoot, "schema-version.json"), '{"version":1}\n');
      await writeFile(join(remoteStateRoot, "sync-revision.txt"), "0\n");
      await writeFile(join(remoteStateRoot, "pglite", "PG_VERSION"), "18\n");

      const session = await prepareRemotePgliteStateSync({
        argv: pruneArgs,
        config: testConfig(localDataRoot, { remoteRuntimeRoot }),
        runner,
      });
      expect(session.isOk()).toBe(true);
      if (session.isErr() || !session.value) throw new Error("Expected destructive sync session");
      const activeSession = session.value;

      expect((await activeSession.releaseForCliRuntime()).isOk()).toBe(true);
      await writeFile(join(activeSession.localPgliteDataDir, "audit.txt"), "uploaded-audit");
      failRelease = true;
      const failedRelease = await activeSession.syncBackAndRelease();
      expect(failedRelease.isErr()).toBe(true);
      expect(await Bun.file(join(remoteStateRoot, "pglite", "audit.txt")).exists()).toBe(true);
      expect(
        await Bun.file(join(activeSession.localDataRoot, "recovery", "pending-sync.json")).exists(),
      ).toBe(false);
      expect(
        (await readdir(dirname(activeSession.localDataRoot))).some((name) =>
          name.startsWith(`${basename(activeSession.localDataRoot)}.base-`),
        ),
      ).toBe(false);

      failRelease = false;
      await rm(join(remoteStateRoot, "locks", "mutation.lock"), { recursive: true, force: true });
      const nextInspect = await prepareRemotePgliteStateSync({
        argv: [
          "appaloft",
          "server",
          "capacity",
          "inspect",
          "srv_primary",
          "--state-backend",
          "ssh-pglite",
          "--server-host",
          "127.0.0.1",
        ],
        config: testConfig(localDataRoot, { remoteRuntimeRoot }),
        runner,
      });
      expect(nextInspect.isOk()).toBe(true);
      if (nextInspect.isErr() || !nextInspect.value)
        throw new Error("Expected next inspect session");
      expect((await nextInspect.value.discardAndRelease()).isOk()).toBe(true);
    } finally {
      await rm(localDataRoot, { recursive: true, force: true });
      await rm(remoteRuntimeRoot, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-STATE-010] releaseForCliRuntime releases the coarse SSH lock before final upload and reacquires it later", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-"));
    const calls: RemotePgliteArchiveRunnerInput[] = [];
    try {
      const session = await prepareRemotePgliteStateSync({
        argv: ["appaloft", "deploy", ".", "--server-host", "203.0.113.10"],
        config: testConfig(dataDir),
        runner: {
          run(input) {
            calls.push(input);

            if (input.command === "tar") {
              return {
                exitCode: 0,
                stdout: new Uint8Array(),
                stderr: "",
                failed: false,
              };
            }

            const joinedArgs = input.args.join(" ");
            if (joinedArgs.includes("sync-revision.txt")) {
              return {
                exitCode: 0,
                stdout: new TextEncoder().encode("0\n"),
                stderr: "",
                failed: false,
              };
            }

            return {
              exitCode: 0,
              stdout: new TextEncoder().encode("archive"),
              stderr: "",
              failed: false,
            };
          },
        },
      });

      expect(session.isOk()).toBe(true);
      if (session.isErr() || !session.value) {
        throw new Error("Expected remote sync session");
      }

      const released = await session.value.releaseForCliRuntime();
      const releasedAgain = await session.value.releaseForCliRuntime();
      const synced = await session.value.syncBackAndRelease();

      expect(released.isOk()).toBe(true);
      expect(releasedAgain.isOk()).toBe(true);
      expect(synced.isOk()).toBe(true);

      const sshCommands = calls
        .filter((call) => call.command === "ssh")
        .map((call) => call.args.join(" "));
      expect(sshCommands).toHaveLength(7);
      expect(sshCommands[0]).toContain("mutation.lock");
      expect(sshCommands[0]).toContain("180");
      expect(sshCommands[1]).toContain("tar -czf - pglite source-links server-applied-routes");
      expect(sshCommands[2]).toContain("sync-revision.txt");
      expect(isRemoteMutationLockRelease(calls.filter((call) => call.command === "ssh")[3]!)).toBe(
        true,
      );
      expect(sshCommands[4]).toContain("mutation.lock");
      expect(sshCommands[4]).toContain("180");
      expect(sshCommands[5]).toContain("expected_revision");
      expect(sshCommands[5]).toContain("next_revision");
      expect(isRemoteMutationLockRelease(calls.filter((call) => call.command === "ssh")[6]!)).toBe(
        true,
      );
      expect(calls.filter(isRemoteMutationLockRelease)).toHaveLength(2);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-STATE-012] final upload refuses to overwrite a newer remote revision", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-"));
    const calls: RemotePgliteArchiveRunnerInput[] = [];
    try {
      const session = await prepareRemotePgliteStateSync({
        argv: ["appaloft", "deploy", ".", "--server-host", "203.0.113.10"],
        config: testConfig(dataDir),
        runner: {
          run(input) {
            calls.push(input);

            if (input.command === "tar") {
              return {
                exitCode: 0,
                stdout: new Uint8Array(),
                stderr: "",
                failed: false,
              };
            }

            const joinedArgs = input.args.join(" ");
            if (
              joinedArgs.includes("sync-revision.txt") &&
              !joinedArgs.includes("expected_revision")
            ) {
              return {
                exitCode: 0,
                stdout: new TextEncoder().encode("0\n"),
                stderr: "",
                failed: false,
              };
            }

            if (joinedArgs.includes("expected_revision")) {
              return {
                exitCode: 76,
                stdout: new Uint8Array(),
                stderr:
                  '{"phase":"remote-state-sync-upload","reason":"remote_state_revision_conflict","expectedRevision":0,"actualRevision":1}',
                failed: true,
              };
            }

            return {
              exitCode: 0,
              stdout: new TextEncoder().encode("archive"),
              stderr: "",
              failed: false,
            };
          },
        },
      });

      expect(session.isOk()).toBe(true);
      if (session.isErr() || !session.value) {
        throw new Error("Expected remote sync session");
      }

      const released = await session.value.releaseForCliRuntime();
      const synced = await session.value.syncBackAndRelease();

      expect(released.isOk()).toBe(true);
      expect(synced.isErr()).toBe(true);
      if (synced.isOk()) {
        throw new Error("Expected sync conflict");
      }
      expect(synced.error).toMatchObject({
        code: "infra_error",
        details: {
          phase: "remote-state-sync-upload",
          reason: "remote_state_merge_failed",
        },
      });
      expect(calls.filter(isRemoteMutationLockRelease)).toHaveLength(2);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 20_000);

  test("[CONFIG-FILE-STATE-010] refreshLocalMirror reacquires the coarse lock, downloads a fresh mirror, and releases again", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-"));
    const calls: RemotePgliteArchiveRunnerInput[] = [];
    try {
      const session = await prepareRemotePgliteStateSync({
        argv: ["appaloft", "deploy", ".", "--server-host", "203.0.113.10"],
        config: testConfig(dataDir),
        runner: {
          run(input) {
            calls.push(input);

            if (input.command === "tar") {
              return {
                exitCode: 0,
                stdout: new Uint8Array(),
                stderr: "",
                failed: false,
              };
            }

            const joinedArgs = input.args.join(" ");
            if (joinedArgs.includes("sync-revision.txt")) {
              const revisionReads = calls.filter(
                (call) =>
                  call.command === "ssh" && call.args.join(" ").includes("sync-revision.txt"),
              ).length;
              return {
                exitCode: 0,
                stdout: new TextEncoder().encode(`${revisionReads - 1}\n`),
                stderr: "",
                failed: false,
              };
            }

            return {
              exitCode: 0,
              stdout: new TextEncoder().encode("archive"),
              stderr: "",
              failed: false,
            };
          },
        },
      });

      expect(session.isOk()).toBe(true);
      if (session.isErr() || !session.value) {
        throw new Error("Expected remote sync session");
      }

      const released = await session.value.releaseForCliRuntime();
      const refreshed = await session.value.refreshLocalMirror();

      expect(released.isOk()).toBe(true);
      expect(refreshed.isOk()).toBe(true);

      const sshCommands = calls
        .filter((call) => call.command === "ssh")
        .map((call) => call.args.join(" "));
      expect(calls.filter(isRemoteMutationLockRelease)).toHaveLength(2);
      expect(
        sshCommands.filter((command) =>
          command.includes("tar -czf - pglite source-links server-applied-routes"),
        ),
      ).toHaveLength(2);
      expect(sshCommands.filter((command) => command.includes("sync-revision.txt"))).toHaveLength(
        2,
      );
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-STATE-012] failed merged upload preserves the merged audit mirror for explicit recovery", async () => {
    const localDataDir = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-local-"));
    const remoteRuntimeRoot = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-remote-"));
    const remoteStateRoot = join(remoteRuntimeRoot, "state");
    const baseRunner = createLocalSshArchiveRunner();
    let uploadAttempts = 0;
    const failedUploadAttempts = new Set<number>();
    const thrownUploadAttempts = new Set([2, 5]);
    let throwConflictDownload = false;
    const runner = {
      run(input: RemotePgliteArchiveRunnerInput) {
        if (
          throwConflictDownload &&
          input.command === "ssh" &&
          input.args.at(-1)?.includes("tar -czf -")
        ) {
          throwConflictDownload = false;
          throw new Error("simulated archive runner interruption during conflict refresh");
        }
        if (input.command === "ssh" && input.args.at(-1)?.includes("expected_revision")) {
          uploadAttempts += 1;
          if (thrownUploadAttempts.has(uploadAttempts)) {
            throw new Error("simulated archive runner interruption after marker commit");
          }
          if (failedUploadAttempts.has(uploadAttempts)) {
            return {
              exitCode: 1,
              stdout: new Uint8Array(),
              stderr: "No space left on device after merge",
              failed: true,
            };
          }
        }
        return baseRunner.run(input);
      },
    };
    const now = "2026-04-22T00:00:00.000Z";

    try {
      const remoteBase = await initializePgliteRoot(remoteStateRoot);
      try {
        await remoteBase.db
          .insertInto("projects")
          .values({
            id: "prj_demo",
            name: "Demo",
            slug: "demo",
            description: null,
            created_at: now,
          })
          .execute();
        await remoteBase.db
          .insertInto("servers")
          .values({
            id: "srv_main",
            name: "Main",
            host: "203.0.113.10",
            port: 22,
            provider_key: "ssh",
            edge_proxy_kind: null,
            edge_proxy_status: null,
            edge_proxy_last_attempt_at: null,
            edge_proxy_last_succeeded_at: null,
            edge_proxy_last_error_code: null,
            edge_proxy_last_error_message: null,
            credential_id: null,
            credential_kind: null,
            credential_username: null,
            credential_public_key: null,
            credential_private_key: null,
            created_at: now,
          })
          .execute();
        await remoteBase.db
          .insertInto("destinations")
          .values({
            id: "dst_main",
            server_id: "srv_main",
            name: "Main",
            kind: "docker",
            created_at: now,
          })
          .execute();
      } finally {
        await remoteBase.close();
      }

      const session = await prepareRemotePgliteStateSync({
        argv: ["appaloft", "deploy", ".", "--server-host", "203.0.113.10"],
        config: testConfig(localDataDir, { remoteRuntimeRoot }),
        runner,
      });

      expect(session.isOk()).toBe(true);
      if (session.isErr() || !session.value) {
        throw new Error("Expected remote sync session");
      }

      const released = await session.value.releaseForCliRuntime();
      expect(released.isOk()).toBe(true);

      const localConnection = await initializePgliteRoot(session.value.localDataRoot);
      try {
        await localConnection.db
          .insertInto("environments")
          .values({
            id: "env_pr13",
            project_id: "prj_demo",
            name: "preview-pr13",
            kind: "preview",
            parent_environment_id: null,
            created_at: now,
          })
          .execute();
        await localConnection.db
          .insertInto("resources")
          .values({
            id: "res_pr13",
            project_id: "prj_demo",
            environment_id: "env_pr13",
            destination_id: "dst_main",
            name: "PR 13",
            slug: "pr-13",
            kind: "application",
            description: null,
            services: [],
            source_binding: null,
            runtime_profile: null,
            network_profile: null,
            lifecycle_status: "active",
            archived_at: null,
            archive_reason: null,
            deleted_at: null,
            created_at: now,
          })
          .execute();
        await localConnection.db
          .insertInto("deployments")
          .values({
            id: "dep_pr13",
            project_id: "prj_demo",
            environment_id: "env_pr13",
            resource_id: "res_pr13",
            server_id: "srv_main",
            destination_id: "dst_main",
            status: "succeeded",
            runtime_plan: {},
            environment_snapshot: {},
            timeline: [],
            created_at: now,
            started_at: now,
            finished_at: now,
            rollback_of_deployment_id: null,
            supersedes_deployment_id: null,
            superseded_by_deployment_id: null,
          })
          .execute();
        await localConnection.db
          .insertInto("source_links")
          .values({
            source_fingerprint: "source://preview/pr-13",
            project_id: "prj_demo",
            environment_id: "env_pr13",
            resource_id: "res_pr13",
            server_id: "srv_main",
            destination_id: "dst_main",
            updated_at: now,
            reason: "local-preview",
            metadata: {},
          })
          .execute();
      } finally {
        await localConnection.close();
      }

      const remoteConcurrent = await initializePgliteRoot(remoteStateRoot);
      try {
        await remoteConcurrent.db
          .insertInto("environments")
          .values({
            id: "env_pr14",
            project_id: "prj_demo",
            name: "preview-pr14",
            kind: "preview",
            parent_environment_id: null,
            created_at: now,
          })
          .execute();
        await remoteConcurrent.db
          .insertInto("resources")
          .values({
            id: "res_pr14",
            project_id: "prj_demo",
            environment_id: "env_pr14",
            destination_id: "dst_main",
            name: "PR 14",
            slug: "pr-14",
            kind: "application",
            description: null,
            services: [],
            source_binding: null,
            runtime_profile: null,
            network_profile: null,
            lifecycle_status: "active",
            archived_at: null,
            archive_reason: null,
            deleted_at: null,
            created_at: now,
          })
          .execute();
        await remoteConcurrent.db
          .insertInto("deployments")
          .values({
            id: "dep_pr14",
            project_id: "prj_demo",
            environment_id: "env_pr14",
            resource_id: "res_pr14",
            server_id: "srv_main",
            destination_id: "dst_main",
            status: "succeeded",
            runtime_plan: {},
            environment_snapshot: {},
            timeline: [],
            created_at: now,
            started_at: now,
            finished_at: now,
            rollback_of_deployment_id: null,
            supersedes_deployment_id: null,
            superseded_by_deployment_id: null,
          })
          .execute();
        await remoteConcurrent.db
          .insertInto("source_links")
          .values({
            source_fingerprint: "source://preview/pr-14",
            project_id: "prj_demo",
            environment_id: "env_pr14",
            resource_id: "res_pr14",
            server_id: "srv_main",
            destination_id: "dst_main",
            updated_at: now,
            reason: "remote-preview",
            metadata: {},
          })
          .execute();
      } finally {
        await remoteConcurrent.close();
      }

      await writeFile(join(remoteStateRoot, "sync-revision.txt"), "1\n");

      const synced = await session.value.syncBackAndRelease();
      expect(synced.isErr()).toBe(true);
      expect(synced._unsafeUnwrapErr().details).toMatchObject({
        reason: "remote_state_sync_upload_interrupted",
        recoveryAction: "run-capacity-inspect-with---retry-pending-state-sync",
      });
      expect(await Bun.file(join(remoteStateRoot, "locks", "mutation.lock")).exists()).toBe(false);
      const pendingPath = join(session.value.localDataRoot, "recovery", "pending-sync.json");
      const pending = JSON.parse(await readFile(pendingPath, "utf8")) as {
        expectedRevision: number;
        nextRevision: number;
        uploadDataRoot: string;
      };
      expect(pending).toMatchObject({ expectedRevision: 1, nextRevision: 2 });
      expect(pending.uploadDataRoot).toContain(`${session.value.localDataRoot}.merged-`);
      expect(await Bun.file(join(pending.uploadDataRoot, "pglite", "PG_VERSION")).exists()).toBe(
        true,
      );

      const recoveryArgs = [
        "appaloft",
        "server",
        "capacity",
        "inspect",
        "srv_main",
        "--state-backend",
        "ssh-pglite",
        "--server-host",
        "203.0.113.10",
        "--retry-pending-state-sync",
      ];
      await writeFile(join(remoteStateRoot, "sync-revision.txt"), "2\n");
      throwConflictDownload = true;
      const interruptedConflictRefresh = await prepareRemotePgliteStateSync({
        argv: recoveryArgs,
        config: testConfig(localDataDir, { remoteRuntimeRoot }),
        runner,
      });
      expect(interruptedConflictRefresh._unsafeUnwrapErr().details).toMatchObject({
        phase: "remote-state-sync-download",
      });
      expect(await Bun.file(join(remoteStateRoot, "locks", "mutation.lock")).exists()).toBe(false);

      const firstRecovery = await prepareRemotePgliteStateSync({
        argv: recoveryArgs,
        config: testConfig(localDataDir, { remoteRuntimeRoot }),
        runner,
      });
      expect(firstRecovery.isErr()).toBe(true);
      const retriedPending = JSON.parse(await readFile(pendingPath, "utf8")) as {
        expectedRevision: number;
        nextRevision: number;
        uploadDataRoot: string;
      };
      expect(retriedPending).toMatchObject({ expectedRevision: 2, nextRevision: 3 });
      expect(retriedPending.uploadDataRoot).toContain(
        `${session.value.localDataRoot}.recovery-merged-`,
      );
      expect(await Bun.file(join(pending.uploadDataRoot, "pglite", "PG_VERSION")).exists()).toBe(
        false,
      );
      expect(
        await Bun.file(join(retriedPending.uploadDataRoot, "pglite", "PG_VERSION")).exists(),
      ).toBe(true);
      expect(await Bun.file(join(remoteStateRoot, "locks", "mutation.lock")).exists()).toBe(false);

      await writeFile(join(remoteStateRoot, "sync-revision.txt"), "3\n");
      const recovered = await prepareRemotePgliteStateSync({
        argv: recoveryArgs,
        config: testConfig(localDataDir, { remoteRuntimeRoot }),
        runner,
      });
      expect(recovered.isOk()).toBe(true);
      if (recovered.isErr() || !recovered.value) {
        throw new Error("Expected merged remote sync recovery session");
      }
      expect((await recovered.value.discardAndRelease()).isOk()).toBe(true);
      expect(await Bun.file(pendingPath).exists()).toBe(false);
      expect(
        await Bun.file(join(retriedPending.uploadDataRoot, "pglite", "PG_VERSION")).exists(),
      ).toBe(false);

      const mergedRemote = await initializePgliteRoot(remoteStateRoot);
      try {
        const environments = await mergedRemote.db
          .selectFrom("environments")
          .select("id")
          .orderBy("id")
          .execute();
        const deployments = await mergedRemote.db
          .selectFrom("deployments")
          .select("id")
          .orderBy("id")
          .execute();
        const sourceLinks = await mergedRemote.db
          .selectFrom("source_links")
          .select("source_fingerprint")
          .orderBy("source_fingerprint")
          .execute();
        const revision = await readFile(join(remoteStateRoot, "sync-revision.txt"), "utf8");

        expect(environments.map((row) => row.id)).toEqual(["env_pr13", "env_pr14"]);
        expect(deployments.map((row) => row.id)).toEqual(["dep_pr13", "dep_pr14"]);
        expect(sourceLinks.map((row) => row.source_fingerprint)).toEqual([
          "source://preview/pr-13",
          "source://preview/pr-14",
        ]);
        expect(revision.trim()).toBe("4");
      } finally {
        await mergedRemote.close();
      }
    } finally {
      await rm(localDataDir, { recursive: true, force: true });
      await rm(remoteRuntimeRoot, { recursive: true, force: true });
    }
  }, 40_000);
});
