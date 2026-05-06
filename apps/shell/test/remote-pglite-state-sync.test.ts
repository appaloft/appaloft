import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
    dataDir,
    pgliteDataDir: join(dataDir, "pglite"),
    remoteRuntimeRoot: overrides?.remoteRuntimeRoot ?? "/var/lib/appaloft/runtime",
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
    scheduledTaskRunner: {
      enabled: false,
      intervalSeconds: 60,
      batchSize: 25,
    },
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
      expect(remoteCommand).toContain("restore_backup");
      expect(remoteCommand).toContain("write_recovery");
      expect(remoteCommand).toContain("remote-sync-upload.json");
      expect(remoteCommand).toContain('tar -xzf - -C "$incoming_dir"');
      expect(remoteCommand).not.toContain("OPENSSH PRIVATE KEY");
    } finally {
      await rm(dataDir, { recursive: true, force: true });
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
      expect(sshCommands[1]).toContain("tar -czf - pglite source-links server-applied-routes");
      expect(sshCommands[2]).toContain("sync-revision.txt");
      expect(sshCommands[3]).toContain('rm -rf "$data_root/locks/mutation.lock"');
      expect(sshCommands[4]).toContain("mutation.lock");
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
  });

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
            logs: [],
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
            logs: [],
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
