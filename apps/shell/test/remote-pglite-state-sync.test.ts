import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
      const command =
        input.command === "ssh"
          ? ["sh", "-lc", input.args[input.args.length - 1] ?? ""]
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

describe("remote PGlite state sync", () => {
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
      expect(uploadCommand).toContain('backup_dir="$data_root/backups/sync-');
      expect(uploadCommand).toContain("restore_backup");
      expect(uploadCommand).toContain("remote-sync-upload.json");
      expect(uploadCommand).toContain('tar -xzf - -C "$incoming_dir"');
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

  test("[CONFIG-FILE-STATE-012] interrupted upload uses remote backup restore recovery command", async () => {
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
      expect(remoteCommand).toContain('backup_dir="$data_root/backups/sync-');
      expect(remoteCommand).toContain("backup_retention_days='7'");
      expect(remoteCommand).toContain("prune_old_sync_backups");
      expect(remoteCommand).toContain("restore_backup");
      expect(remoteCommand).toContain("write_recovery");
      expect(remoteCommand).toContain("remote-sync-upload.json");
      expect(remoteCommand).toContain('tar -xzf - -C "$incoming_dir"');
      expect(remoteCommand).not.toContain("OPENSSH PRIVATE KEY");
    } finally {
      await rm(dataDir, { recursive: true, force: true });
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

  test("[DEPLOYMENTS-CLEANUP-PREVIEW-010] preview cleanup remote session preserves standalone SSH live PGlite state", async () => {
    const localDataRoot = await mkdtemp(join(tmpdir(), "appaloft-preview-cleanup-local-"));
    const remoteRuntimeRoot = await mkdtemp(join(tmpdir(), "appaloft-preview-cleanup-remote-"));
    const remoteStateRoot = join(remoteRuntimeRoot, "state");

    try {
      await mkdir(join(remoteStateRoot, "pglite"), { recursive: true });
      await mkdir(join(remoteStateRoot, "source-links"), { recursive: true });
      await mkdir(join(remoteStateRoot, "server-applied-routes"), { recursive: true });
      await writeFile(join(remoteStateRoot, "pglite", "live.txt"), "standalone-live-state");
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
      expect(sshCommands[3]).toContain('rm -rf "$data_root/locks/mutation.lock"');
      expect(sshCommands[4]).toContain("mutation.lock");
      expect(sshCommands[4]).toContain("180");
      expect(sshCommands[5]).toContain("expected_revision");
      expect(sshCommands[5]).toContain("next_revision");
      expect(sshCommands[6]).toContain('rm -rf "$data_root/locks/mutation.lock"');
      expect(
        calls.filter(
          (call) =>
            call.command === "ssh" &&
            call.args.join(" ").includes('rm -rf "$data_root/locks/mutation.lock"'),
        ),
      ).toHaveLength(2);
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
      expect(
        calls.filter(
          (call) =>
            call.command === "ssh" &&
            call.args.join(" ").includes('rm -rf "$data_root/locks/mutation.lock"'),
        ),
      ).toHaveLength(2);
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
      expect(
        sshCommands.filter((command) =>
          command.includes('rm -rf "$data_root/locks/mutation.lock"'),
        ),
      ).toHaveLength(2);
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

  test("[CONFIG-FILE-STATE-012] final upload merges disjoint PGlite row changes onto a newer remote revision", async () => {
    const localDataDir = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-local-"));
    const remoteRuntimeRoot = await mkdtemp(join(tmpdir(), "appaloft-remote-sync-remote-"));
    const remoteStateRoot = join(remoteRuntimeRoot, "state");
    const runner = createLocalSshArchiveRunner();
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
      expect(synced.isOk()).toBe(true);

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
        expect(revision.trim()).toBe("2");
      } finally {
        await mergedRemote.close();
      }
    } finally {
      await rm(localDataDir, { recursive: true, force: true });
      await rm(remoteRuntimeRoot, { recursive: true, force: true });
    }
  }, 20_000);
});
