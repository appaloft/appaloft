import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildSshRemoteStateProcessArgs,
  type SshRemoteCommandInput,
  type SshRemoteCommandResult,
  SshRemoteStateLifecycle,
} from "../src/commands/deployment-ssh-remote-state";

function successfulSshResult(): SshRemoteCommandResult {
  return {
    exitCode: 0,
    stdout: "ok\n",
    stderr: "",
    failed: false,
  };
}

function executeCommand(command: string): SshRemoteCommandResult {
  const result = Bun.spawnSync(["sh", "-lc", command], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    failed: !result.success,
  };
}

describe("CLI SSH remote state lifecycle", () => {
  test("[CONFIG-FILE-STATE-002] SSH adapter prepares remote durable state before mutation", async () => {
    const commands: SshRemoteCommandInput[] = [];
    const lifecycle = new SshRemoteStateLifecycle({
      dataRoot: "/var/lib/appaloft/runtime/state",
      target: {
        host: "203.0.113.10",
        port: 2222,
        username: "deploy",
        identityFile: "/home/runner/.ssh/appaloft",
      },
      owner: "appaloft-cli",
      correlationId: "run_1",
      heartbeatIntervalMs: null,
      runner: {
        run: async (input) => {
          commands.push(input);
          return successfulSshResult();
        },
      },
    });

    const prepared = await lifecycle.prepare();

    expect(prepared.isOk()).toBe(true);
    if (prepared.isErr()) {
      throw new Error(prepared.error.message);
    }
    expect(commands).toHaveLength(1);
    expect(commands[0]?.target).toMatchObject({
      host: "203.0.113.10",
      port: 2222,
      username: "deploy",
      identityFile: "/home/runner/.ssh/appaloft",
    });
    expect(commands[0]?.command).toContain("mkdir -p");
    expect(commands[0]?.command).toContain("backend.json");
    expect(commands[0]?.command).toContain("server-state-backend/v1");
    expect(commands[0]?.command).toContain("ssh-pglite");
    expect(commands[0]?.command).toContain("schema-version.json");
    expect(commands[0]?.command).toContain("mutation.lock");
    expect(commands[0]?.command).toContain("lastHeartbeatAt");
    expect(commands[0]?.command).toContain("staleAfterSeconds");
    expect(commands[0]?.command).toContain("owner_file_present");
    expect(commands[0]?.command).toContain('recorded_stale_after" -gt "$stale_after_seconds"');
    expect(commands[0]?.command).toContain("recorded_stale_after=30");
    expect(commands[0]?.command).toContain('date -j -u -f "%Y-%m-%dT%H:%M:%SZ"');
    expect(commands[0]?.command).toContain('stat -f %m "$lock_dir"');
    expect(commands[0]?.command).toContain("locks/recovered");
    expect(commands[0]?.command).toContain("backups");
    expect(commands[0]?.command).toContain("journals");
    expect(commands[0]?.command).toContain("server-applied-routes");
    expect(commands[0]?.command).toContain('[ ! -d "$lock_dir" ]');
    expect(commands[0]?.command).toContain("remote state mutation lock could not be created");
    expect(commands[0]?.command).not.toContain("OPENSSH PRIVATE KEY");

    const released = await prepared.value.release();

    expect(released.isOk()).toBe(true);
    expect(commands).toHaveLength(2);
    expect(commands[1]?.command).toContain("rm -rf");
    expect(commands[1]?.command).toContain("mutation.lock");
  });

  test("[CONFIG-FILE-STATE-015] SSH adapter returns structured backend mismatch", async () => {
    const lifecycle = new SshRemoteStateLifecycle({
      dataRoot: "/var/lib/appaloft/runtime/state",
      target: {
        host: "203.0.113.10",
        port: 22,
        username: "deploy",
      },
      heartbeatIntervalMs: null,
      lockAcquireTimeoutMs: 0,
      runner: {
        run: async () => ({
          exitCode: 77,
          stdout: "",
          stderr:
            '{"phase":"server-state-backend","reason":"SERVER_STATE_BACKEND_MISMATCH","expectedStateBackend":"ssh-pglite","actualStateBackend":"postgres-control-plane"}',
          failed: true,
        }),
      },
    });

    const prepared = await lifecycle.prepare();

    expect(prepared.isErr()).toBe(true);
    if (prepared.isOk()) {
      throw new Error("Expected backend mismatch failure");
    }
    expect(prepared.error).toMatchObject({
      code: "server_state_backend_mismatch",
      retryable: false,
      details: {
        phase: "server-state-backend",
        reason: "SERVER_STATE_BACKEND_MISMATCH",
        expectedStateBackend: "ssh-pglite",
        actualStateBackend: "postgres-control-plane",
        host: "203.0.113.10",
        port: "22",
      },
    });
  });

  test("[CONFIG-FILE-STATE-003] SSH adapter maps remote lock conflicts", async () => {
    const lifecycle = new SshRemoteStateLifecycle({
      dataRoot: "/var/lib/appaloft/runtime/state",
      target: {
        host: "203.0.113.10",
        port: 22,
        username: "deploy",
      },
      heartbeatIntervalMs: null,
      lockAcquireTimeoutMs: 0,
      runner: {
        run: async () => ({
          exitCode: 73,
          stdout: "",
          stderr:
            '{"owner":"first","correlationId":"run_1","startedAt":"2026-04-19T00:00:00Z","lastHeartbeatAt":"2026-04-19T00:05:00Z","staleAfterSeconds":1200}',
          failed: true,
        }),
      },
    });

    const prepared = await lifecycle.prepare();

    expect(prepared.isErr()).toBe(true);
    if (prepared.isOk()) {
      throw new Error("Expected remote lock failure");
    }
    expect(prepared.error).toMatchObject({
      code: "infra_error",
      retryable: true,
      knowledge: {
        responsibility: "operator",
        actionability: "run-diagnostic",
      },
      details: {
        phase: "remote-state-lock",
        stateBackend: "ssh-pglite",
        host: "203.0.113.10",
        port: "22",
        lockOwner: "first",
        correlationId: "run_1",
        lockStartedAt: "2026-04-19T00:00:00Z",
        lockHeartbeatAt: "2026-04-19T00:05:00Z",
        staleAfterSeconds: 1200,
      },
    });
    expect(prepared.error.knowledge?.links?.some((link) => link.rel === "human-doc")).toBe(true);
    expect(prepared.error.knowledge?.links?.some((link) => link.rel === "llm-guide")).toBe(true);
    expect(JSON.stringify(prepared.error)).not.toContain("OPENSSH PRIVATE KEY");
  });

  test("[CONFIG-FILE-STATE-003] SSH adapter retries active lock briefly", async () => {
    let attempts = 0;
    const lifecycle = new SshRemoteStateLifecycle({
      dataRoot: "/var/lib/appaloft/runtime/state",
      target: {
        host: "203.0.113.10",
        port: 22,
        username: "deploy",
      },
      heartbeatIntervalMs: null,
      lockAcquireTimeoutMs: 100,
      lockRetryIntervalMs: 10,
      runner: {
        run: async () => {
          attempts += 1;
          if (attempts === 1) {
            return {
              exitCode: 73,
              stdout: "",
              stderr:
                '{"owner":"first","correlationId":"run_1","startedAt":"2026-04-19T00:00:00Z","lastHeartbeatAt":"2026-04-19T00:05:00Z","staleAfterSeconds":1200}',
              failed: true,
            };
          }
          return successfulSshResult();
        },
      },
    });

    const prepared = await lifecycle.prepare();

    expect(prepared.isOk()).toBe(true);
    expect(attempts).toBe(2);
    if (prepared.isErr()) {
      throw new Error(prepared.error.message);
    }
  });

  test("[CONFIG-FILE-STATE-010] SSH process args use identity file without embedding key material", () => {
    const args = buildSshRemoteStateProcessArgs({
      host: "203.0.113.10",
      port: 2222,
      username: "deploy",
      identityFile: "/home/runner/.ssh/appaloft",
    });

    expect(args).toContain("-i");
    expect(args).toContain("/home/runner/.ssh/appaloft");
    expect(args).toContain("IdentitiesOnly=yes");
    expect(args).toContain("deploy@203.0.113.10");
    expect(args.join(" ")).not.toContain("OPENSSH PRIVATE KEY");
  });

  test("[CONFIG-FILE-STATE-002] rendered prepare and release scripts execute through the command boundary", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "appaloft-ssh-remote-state-ash-"));
    const commands: SshRemoteCommandInput[] = [];
    const lifecycle = new SshRemoteStateLifecycle({
      dataRoot,
      target: {
        host: "203.0.113.10",
        port: 2222,
        username: "deploy",
      },
      owner: "appaloft-cli",
      correlationId: "run_ash",
      heartbeatIntervalMs: null,
      runner: {
        run: async (input) => {
          commands.push(input);
          return executeCommand(input.command);
        },
      },
    });

    try {
      const prepared = await lifecycle.prepare();
      expect(prepared.isOk()).toBe(true);
      if (prepared.isErr()) {
        throw new Error(prepared.error.message);
      }
      expect(commands[0]?.command).toContain("sh -lc");
      expect(await Bun.file(join(dataRoot, "backend.json")).exists()).toBe(true);
      expect(await Bun.file(join(dataRoot, "schema-version.json")).exists()).toBe(true);
      expect(await Bun.file(join(dataRoot, "locks", "mutation.lock", "owner.json")).exists()).toBe(
        true,
      );

      const released = await prepared.value.release();
      expect(released.isOk()).toBe(true);
      expect(commands[1]?.command).toContain("sh -lc");
      expect(await Bun.file(join(dataRoot, "locks", "mutation.lock")).exists()).toBe(false);
    } finally {
      rmSync(dataRoot, { force: true, recursive: true });
    }
  });
});
