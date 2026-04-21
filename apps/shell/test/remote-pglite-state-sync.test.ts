import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type RemotePgliteArchiveRunnerInput,
  RemotePgliteArchiveSync,
  resolveRemotePgliteStateSyncPlan,
} from "../src/remote-pglite-state-sync";

function testConfig(dataDir: string) {
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
    remoteRuntimeRoot: "/var/lib/appaloft/runtime",
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
    enabledSystemPlugins: [],
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
});
