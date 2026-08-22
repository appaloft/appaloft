import { describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
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
  const commandWithSyncShim = `sync() { return 0; }\n${command.replaceAll(
    "sleep 15 &",
    "sleep 15 </dev/null >/dev/null 2>&1 &",
  )}`;
  const executableCommand =
    process.platform === "darwin"
      ? commandWithSyncShim
          .replaceAll("command -v flock >/dev/null 2>&1", "true")
          .replaceAll("flock -w 5 9", "true")
          .replaceAll("flock -u 9", "true")
      : commandWithSyncShim;
  const result = Bun.spawnSync(["sh", "-lc", executableCommand], {
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

  test("[CPS-REMOTE-013] read-only prepare leaves durable remote state unchanged", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "appaloft-readonly-state-"));
    const schemaMarker = join(dataRoot, "schema-version.json");
    const backendMarker = join(dataRoot, "backend.json");
    const commands: string[] = [];

    try {
      mkdirSync(join(dataRoot, "pglite"), { recursive: true });
      mkdirSync(join(dataRoot, "locks"), { recursive: true });
      writeFileSync(schemaMarker, '{"version":1,"migratedAt":"legacy"}\n');
      writeFileSync(join(dataRoot, "pglite", "live.txt"), "live-state");
      chmodSync(join(dataRoot, "locks"), 0o555);

      const lifecycle = new SshRemoteStateLifecycle({
        dataRoot,
        readOnly: true,
        target: { host: "127.0.0.1" },
        owner: "appaloft-cli",
        correlationId: "readonly_1",
        heartbeatIntervalMs: null,
        runner: {
          run: ({ command }) => {
            commands.push(command);
            return executeCommand(command);
          },
        },
      });

      const prepared = await lifecycle.prepare();

      expect(prepared.isOk()).toBe(true);
      if (prepared.isErr()) {
        throw new Error(prepared.error.message);
      }
      expect(existsSync(backendMarker)).toBe(false);
      expect(existsSync(join(dataRoot, "backups"))).toBe(false);
      expect(existsSync(join(dataRoot, "journals"))).toBe(false);
      expect(readFileSync(schemaMarker, "utf8")).toBe('{"version":1,"migratedAt":"legacy"}\n');

      const released = await prepared.value.release();

      expect(released.isOk()).toBe(true);
      expect(commands).toHaveLength(1);
      expect(readdirSync(join(dataRoot, "locks"))).toEqual([]);
      expect(readFileSync(join(dataRoot, "pglite", "live.txt"), "utf8")).toBe("live-state");
      expect(readFileSync(schemaMarker, "utf8")).toBe('{"version":1,"migratedAt":"legacy"}\n');
    } finally {
      chmodSync(join(dataRoot, "locks"), 0o755);
      rmSync(dataRoot, { recursive: true, force: true });
    }
  });

  test("[CPS-REMOTE-013] read-only prepare never recovers a stale lock", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "appaloft-readonly-stale-lock-"));
    const lockRoot = join(dataRoot, "locks", "mutation.lock");

    try {
      mkdirSync(join(dataRoot, "pglite"), { recursive: true });
      mkdirSync(lockRoot, { recursive: true });
      writeFileSync(join(dataRoot, "schema-version.json"), '{"version":1}\n');
      writeFileSync(
        join(lockRoot, "owner.json"),
        '{"owner":"previous","correlationId":"previous_1","startedAt":"2020-01-01T00:00:00Z","lastHeartbeatAt":"2020-01-01T00:00:00Z","staleAfterSeconds":1}\n',
      );

      const lifecycle = new SshRemoteStateLifecycle({
        dataRoot,
        readOnly: true,
        target: { host: "127.0.0.1" },
        heartbeatIntervalMs: null,
        lockAcquireTimeoutMs: 0,
        staleAfterMs: 1_000,
        runner: { run: ({ command }) => executeCommand(command) },
      });

      const prepared = await lifecycle.prepare();

      expect(prepared.isErr()).toBe(true);
      expect(existsSync(lockRoot)).toBe(true);
      expect(existsSync(join(dataRoot, "locks", "recovered"))).toBe(false);
      expect(readFileSync(join(lockRoot, "owner.json"), "utf8")).toContain(
        '"correlationId":"previous_1"',
      );
    } finally {
      rmSync(dataRoot, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-STATE-012G] prepare rejects a symlinked state root before external mutation", async () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "appaloft-symlink-state-root-"));
    const externalRoot = join(fixtureRoot, "external");
    const dataRoot = join(fixtureRoot, "state");

    try {
      mkdirSync(externalRoot, { recursive: true });
      symlinkSync(externalRoot, dataRoot);

      const lifecycle = new SshRemoteStateLifecycle({
        dataRoot,
        target: { host: "127.0.0.1" },
        owner: "appaloft-cli",
        correlationId: "symlink_root_1",
        heartbeatIntervalMs: null,
        runner: { run: ({ command }) => executeCommand(command) },
      });

      const prepared = await lifecycle.prepare();

      expect(prepared.isErr()).toBe(true);
      expect(readdirSync(externalRoot)).toEqual([]);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-STATE-012G] prepare rejects symlinked lock and schema paths", async () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "appaloft-symlink-state-paths-"));

    try {
      const recoveryStateRoot = join(fixtureRoot, "recovery-state");
      const externalRecovery = join(fixtureRoot, "external-recovery");
      mkdirSync(recoveryStateRoot, { recursive: true });
      mkdirSync(externalRecovery);
      symlinkSync(externalRecovery, join(recoveryStateRoot, "recovery"));

      const recoveryPrepared = await new SshRemoteStateLifecycle({
        dataRoot: recoveryStateRoot,
        target: { host: "127.0.0.1" },
        heartbeatIntervalMs: null,
        runner: { run: ({ command }) => executeCommand(command) },
      }).prepare();

      expect(recoveryPrepared.isErr()).toBe(true);
      expect(readdirSync(externalRecovery)).toEqual([]);

      const lockStateRoot = join(fixtureRoot, "lock-state");
      const externalLock = join(fixtureRoot, "external-lock");
      mkdirSync(join(lockStateRoot, "locks"), { recursive: true });
      mkdirSync(externalLock);
      symlinkSync(externalLock, join(lockStateRoot, "locks", "mutation.lock"));

      const lockPrepared = await new SshRemoteStateLifecycle({
        dataRoot: lockStateRoot,
        target: { host: "127.0.0.1" },
        heartbeatIntervalMs: null,
        runner: { run: ({ command }) => executeCommand(command) },
      }).prepare();

      expect(lockPrepared.isErr()).toBe(true);
      expect(readdirSync(externalLock)).toEqual([]);

      const guardStateRoot = join(fixtureRoot, "guard-state");
      const externalGuard = join(fixtureRoot, "external-guard");
      mkdirSync(join(guardStateRoot, "locks"), { recursive: true });
      mkdirSync(externalGuard);
      symlinkSync(externalGuard, join(guardStateRoot, "locks", "mutation.guard"));

      const guardPrepared = await new SshRemoteStateLifecycle({
        dataRoot: guardStateRoot,
        target: { host: "127.0.0.1" },
        heartbeatIntervalMs: null,
        runner: { run: ({ command }) => executeCommand(command) },
      }).prepare();

      expect(guardPrepared.isErr()).toBe(true);
      expect(readdirSync(externalGuard)).toEqual([]);

      const ownerStateRoot = join(fixtureRoot, "owner-state");
      const externalOwner = join(fixtureRoot, "external-owner.json");
      mkdirSync(join(ownerStateRoot, "locks", "mutation.lock"), { recursive: true });
      writeFileSync(externalOwner, "external-owner\n");
      symlinkSync(externalOwner, join(ownerStateRoot, "locks", "mutation.lock", "owner.json"));

      const ownerPrepared = await new SshRemoteStateLifecycle({
        dataRoot: ownerStateRoot,
        target: { host: "127.0.0.1" },
        heartbeatIntervalMs: null,
        runner: { run: ({ command }) => executeCommand(command) },
      }).prepare();

      expect(ownerPrepared.isErr()).toBe(true);
      expect(readFileSync(externalOwner, "utf8")).toBe("external-owner\n");

      const schemaStateRoot = join(fixtureRoot, "schema-state");
      const externalSchema = join(fixtureRoot, "external-schema.json");
      mkdirSync(schemaStateRoot, { recursive: true });
      writeFileSync(externalSchema, '{"version":99}\n');
      symlinkSync(externalSchema, join(schemaStateRoot, "schema-version.json"));

      const schemaPrepared = await new SshRemoteStateLifecycle({
        dataRoot: schemaStateRoot,
        target: { host: "127.0.0.1" },
        heartbeatIntervalMs: null,
        runner: { run: ({ command }) => executeCommand(command) },
      }).prepare();

      expect(schemaPrepared.isErr()).toBe(true);
      expect(readFileSync(externalSchema, "utf8")).toBe('{"version":99}\n');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
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
      lockToken: "lifecycle-run-ash",
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
      expect(
        readFileSync(join(dataRoot, "locks", "mutation.lock", "owner.json"), "utf8"),
      ).toContain('"lockToken":"lifecycle-run-ash"');

      const released = await prepared.value.release();
      expect(released.isOk()).toBe(true);
      expect(commands[1]?.command).toContain("sh -lc");
      expect(await Bun.file(join(dataRoot, "locks", "mutation.lock")).exists()).toBe(false);
    } finally {
      rmSync(dataRoot, { force: true, recursive: true });
    }
  });

  test("[CONFIG-FILE-STATE-003] an old session cannot release a replacement with reused owner metadata", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "appaloft-release-token-aba-"));
    const lifecycle = new SshRemoteStateLifecycle({
      dataRoot,
      target: { host: "127.0.0.1" },
      owner: "shared-owner",
      correlationId: "shared-correlation",
      lockToken: "lifecycle-old-token",
      heartbeatIntervalMs: null,
      runner: { run: ({ command }) => executeCommand(command) },
    });

    try {
      const prepared = await lifecycle.prepare();
      expect(prepared.isOk()).toBe(true);
      if (prepared.isErr()) throw new Error(prepared.error.message);
      const ownerFile = join(dataRoot, "locks", "mutation.lock", "owner.json");
      writeFileSync(
        ownerFile,
        '{"owner":"shared-owner","correlationId":"shared-correlation","lockToken":"lifecycle-replacement-token","startedAt":"2026-08-23T00:00:00Z","lastHeartbeatAt":"2026-08-23T00:00:00Z","staleAfterSeconds":1200}\n',
      );

      const released = await prepared.value.release();

      expect(released.isErr()).toBe(true);
      expect(readFileSync(ownerFile, "utf8")).toContain(
        '"lockToken":"lifecycle-replacement-token"',
      );
      expect(existsSync(join(dataRoot, "locks", "mutation.lock"))).toBe(true);
    } finally {
      rmSync(dataRoot, { force: true, recursive: true });
    }
  });

  test("[CONFIG-FILE-STATE-003] release detaches only its owned lock before a replacement lock appears", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "appaloft-release-race-"));
    let commandCount = 0;
    const lifecycle = new SshRemoteStateLifecycle({
      dataRoot,
      target: { host: "127.0.0.1" },
      owner: "old-owner",
      correlationId: "old-correlation",
      heartbeatIntervalMs: null,
      runner: {
        run: ({ command }) => {
          commandCount += 1;
          if (commandCount !== 2) return executeCommand(command);
          const detach = 'mv "$lock_dir" "$release_dir" || exit 75';
          expect(command).toContain(detach);
          return executeCommand(
            command.replace(
              detach,
              `${detach}\nmkdir "$lock_dir"\nprintf '%s\\n' new-owner > "$lock_dir/owner.json"`,
            ),
          );
        },
      },
    });

    try {
      const prepared = await lifecycle.prepare();
      expect(prepared.isOk()).toBe(true);
      if (prepared.isErr()) throw new Error(prepared.error.message);

      const released = await prepared.value.release();

      expect(released.isOk()).toBe(true);
      expect(
        readFileSync(join(dataRoot, "locks", "mutation.lock", "owner.json"), "utf8"),
      ).toContain("new-owner");
    } finally {
      rmSync(dataRoot, { force: true, recursive: true });
    }
  });

  test("[CONFIG-FILE-STATE-003] release restores a replacement lock raced in before detach", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "appaloft-release-pre-detach-race-"));
    let commandCount = 0;
    const lifecycle = new SshRemoteStateLifecycle({
      dataRoot,
      target: { host: "127.0.0.1" },
      owner: "old-owner",
      correlationId: "old-correlation",
      heartbeatIntervalMs: null,
      runner: {
        run: ({ command }) => {
          commandCount += 1;
          if (commandCount !== 2) return executeCommand(command);
          const detach = 'mv "$lock_dir" "$release_dir" || exit 75';
          expect(command).toContain(detach);
          return executeCommand(
            command.replace(
              detach,
              `mv "$lock_dir" "$data_root/locks/.stale-release-old"\nmkdir "$lock_dir"\nprintf '%s' new-owner-before-detach > "$lock_dir/owner.json"\n${detach}`,
            ),
          );
        },
      },
    });

    try {
      const prepared = await lifecycle.prepare();
      expect(prepared.isOk()).toBe(true);
      if (prepared.isErr()) throw new Error(prepared.error.message);

      const released = await prepared.value.release();

      expect(released.isErr()).toBe(true);
      expect(
        readFileSync(join(dataRoot, "locks", "mutation.lock", "owner.json"), "utf8"),
      ).toContain("new-owner-before-detach");
    } finally {
      rmSync(dataRoot, { force: true, recursive: true });
    }
  });

  test("[CONFIG-FILE-STATE-003] release waits for an in-flight heartbeat", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "appaloft-heartbeat-release-"));
    let heartbeatStartedResolve: (() => void) | undefined;
    const heartbeatStarted = new Promise<void>((resolve) => {
      heartbeatStartedResolve = resolve;
    });
    let finishHeartbeatResolve: (() => void) | undefined;
    const finishHeartbeat = new Promise<void>((resolve) => {
      finishHeartbeatResolve = resolve;
    });
    let releaseCalls = 0;
    const lifecycle = new SshRemoteStateLifecycle({
      dataRoot,
      target: { host: "127.0.0.1" },
      owner: "heartbeat-owner",
      correlationId: "heartbeat-correlation",
      heartbeatIntervalMs: 1,
      runner: {
        async run({ command }) {
          if (command.includes(".owner-heartbeat-")) {
            heartbeatStartedResolve?.();
            await finishHeartbeat;
          }
          if (command.includes(".mutation-release-")) releaseCalls += 1;
          return executeCommand(command);
        },
      },
    });

    try {
      const prepared = await lifecycle.prepare();
      expect(prepared.isOk()).toBe(true);
      if (prepared.isErr()) throw new Error(prepared.error.message);
      await heartbeatStarted;

      const releasing = prepared.value.release();
      await Promise.resolve();
      expect(releaseCalls).toBe(0);

      finishHeartbeatResolve?.();
      const released = await releasing;
      expect(released.isOk()).toBe(true);
      expect(releaseCalls).toBe(1);
    } finally {
      finishHeartbeatResolve?.();
      rmSync(dataRoot, { force: true, recursive: true });
    }
  });

  test("[CONFIG-FILE-STATE-003] stale heartbeat cannot overwrite a replacement owner", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "appaloft-heartbeat-owner-race-"));
    const lifecycle = new SshRemoteStateLifecycle({
      dataRoot,
      target: { host: "127.0.0.1" },
      owner: "old-heartbeat-owner",
      correlationId: "old-heartbeat-correlation",
      lockToken: "lifecycle-old-heartbeat-token",
      heartbeatIntervalMs: 20,
      runner: { run: ({ command }) => executeCommand(command) },
    });

    try {
      const prepared = await lifecycle.prepare();
      expect(prepared.isOk()).toBe(true);
      if (prepared.isErr()) throw new Error(prepared.error.message);
      const ownerFile = join(dataRoot, "locks", "mutation.lock", "owner.json");
      writeFileSync(
        ownerFile,
        '{"owner":"old-heartbeat-owner","correlationId":"old-heartbeat-correlation","lockToken":"lifecycle-new-heartbeat-token"}\n',
      );
      await Bun.sleep(80);

      expect(readFileSync(ownerFile, "utf8")).toContain(
        '"lockToken":"lifecycle-new-heartbeat-token"',
      );
      const released = await prepared.value.release();
      expect(released.isErr()).toBe(true);
      expect(readFileSync(ownerFile, "utf8")).toContain(
        '"lockToken":"lifecycle-new-heartbeat-token"',
      );
    } finally {
      rmSync(dataRoot, { force: true, recursive: true });
    }
  });

  test("[CONFIG-FILE-STATE-003] prepare failure cleans only its owned fresh lock", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "appaloft-prepare-cleanup-"));
    const lifecycle = new SshRemoteStateLifecycle({
      dataRoot,
      target: { host: "127.0.0.1" },
      owner: "prepare-owner",
      correlationId: "prepare-correlation",
      heartbeatIntervalMs: null,
      lockAcquireTimeoutMs: 0,
      runner: {
        run: ({ command }) => {
          expect(command).toContain("cleanup_prepare_lock");
          expect(command).toContain("current_version=0");
          return executeCommand(command.replace("current_version=0", "false\ncurrent_version=0"));
        },
      },
    });

    try {
      const prepared = await lifecycle.prepare();

      expect(prepared.isErr()).toBe(true);
      expect(existsSync(join(dataRoot, "locks", "mutation.lock"))).toBe(false);
      expect(
        readdirSync(join(dataRoot, "locks")).filter((name) =>
          name.startsWith(".mutation-prepare-failed-"),
        ),
      ).toEqual([]);
    } finally {
      rmSync(dataRoot, { force: true, recursive: true });
    }
  });

  test("[CONFIG-FILE-STATE-003] owner write failure cleans the ownerless fresh lock", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "appaloft-owner-write-failure-"));
    const lifecycle = new SshRemoteStateLifecycle({
      dataRoot,
      target: { host: "127.0.0.1" },
      owner: "owner-write-failure",
      correlationId: "owner-write-failure-correlation",
      heartbeatIntervalMs: null,
      lockAcquireTimeoutMs: 0,
      runner: {
        run: ({ command }) => {
          const ownerWrite = '> "$owner_file"';
          expect(command).toContain(ownerWrite);
          return executeCommand(command.replace(ownerWrite, '> "$data_root"'));
        },
      },
    });

    try {
      const prepared = await lifecycle.prepare();

      expect(prepared.isErr()).toBe(true);
      expect(existsSync(join(dataRoot, "locks", "mutation.lock"))).toBe(false);
      expect(existsSync(join(dataRoot, "locks", "mutation.guard"))).toBe(false);
    } finally {
      rmSync(dataRoot, { force: true, recursive: true });
    }
  });

  test("[CONFIG-FILE-STATE-003] stale transition guard is archived and reacquired after a crash", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "appaloft-stale-transition-guard-"));
    const locksRoot = join(dataRoot, "locks");
    const guardRoot = join(locksRoot, "mutation.guard");
    mkdirSync(join(locksRoot, "recovered"), { recursive: true });
    mkdirSync(guardRoot);
    writeFileSync(
      join(guardRoot, "owner.json"),
      '{"token":"crashed","operation":"prepare","pid":1,"startedAt":"2020-01-01T00:00:00Z","staleAfterSeconds":30}\n',
    );
    utimesSync(guardRoot, new Date("2020-01-01T00:00:00Z"), new Date("2020-01-01T00:00:00Z"));

    const lifecycle = new SshRemoteStateLifecycle({
      dataRoot,
      target: { host: "127.0.0.1" },
      owner: "post-crash-owner",
      correlationId: "post-crash-correlation",
      heartbeatIntervalMs: null,
      lockAcquireTimeoutMs: 0,
      runner: { run: ({ command }) => executeCommand(command) },
    });

    try {
      const prepared = await lifecycle.prepare();

      expect(prepared.isOk()).toBe(true);
      if (prepared.isErr()) throw new Error(prepared.error.message);
      const recoveredGuard = readdirSync(join(locksRoot, "recovered")).find((name) =>
        name.startsWith("guard-"),
      );
      expect(recoveredGuard).toBeDefined();
      expect(existsSync(join(locksRoot, "recovered", recoveredGuard!, "recovered.json"))).toBe(
        true,
      );
      expect(existsSync(guardRoot)).toBe(false);
      expect((await prepared.value.release()).isOk()).toBe(true);
    } finally {
      rmSync(dataRoot, { force: true, recursive: true });
    }
  });

  test("[CONFIG-FILE-STATE-003] fresh transition guard residue observes its bounded grace", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "appaloft-fresh-transition-guard-"));
    const guardRoot = join(dataRoot, "locks", "mutation.guard");
    mkdirSync(guardRoot, { recursive: true });
    const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    writeFileSync(
      join(guardRoot, "owner.json"),
      `{"token":"recent-crash","owner":"previous","correlationId":"previous","operation":"prepare","lastHeartbeatAt":"${now}","staleAfterSeconds":30}\n`,
    );
    const lifecycle = new SshRemoteStateLifecycle({
      dataRoot,
      target: { host: "127.0.0.1" },
      heartbeatIntervalMs: null,
      lockAcquireTimeoutMs: 0,
      runner: { run: ({ command }) => executeCommand(command) },
    });

    try {
      const prepared = await lifecycle.prepare();

      expect(prepared.isErr()).toBe(true);
      expect(existsSync(guardRoot)).toBe(true);
      expect(readdirSync(join(dataRoot, "locks", "recovered"))).toEqual([]);
    } finally {
      rmSync(dataRoot, { force: true, recursive: true });
    }
  });

  if (process.platform === "linux") {
    test("[CONFIG-FILE-STATE-003] kernel transition gate serializes concurrent contenders", async () => {
      const dataRoot = mkdtempSync(join(tmpdir(), "appaloft-kernel-transition-gate-"));
      const readyPath = join(dataRoot, "first-transition-ready");
      const asyncRunner = (holdTransition: boolean) => ({
        async run({ command }: SshRemoteCommandInput) {
          const executable = holdTransition
            ? command.replace(
                "guard_kernel_owned=true",
                `guard_kernel_owned=true\nprintf '%s' ready > '${readyPath}'\nsleep 1`,
              )
            : command;
          const process = Bun.spawn(["sh", "-lc", executable], {
            stdout: "pipe",
            stderr: "pipe",
          });
          const stdout = new Response(process.stdout).text();
          const stderr = new Response(process.stderr).text();
          const exitCode = await process.exited;
          return {
            exitCode,
            stdout: await stdout,
            stderr: await stderr,
            failed: exitCode !== 0,
          };
        },
      });
      const first = new SshRemoteStateLifecycle({
        dataRoot,
        target: { host: "127.0.0.1" },
        owner: "first",
        correlationId: "first-transition",
        heartbeatIntervalMs: null,
        lockAcquireTimeoutMs: 0,
        runner: asyncRunner(true),
      });
      const second = new SshRemoteStateLifecycle({
        dataRoot,
        target: { host: "127.0.0.1" },
        owner: "second",
        correlationId: "second-transition",
        heartbeatIntervalMs: null,
        lockAcquireTimeoutMs: 0,
        runner: asyncRunner(false),
      });

      try {
        const firstPreparing = first.prepare();
        for (let attempt = 0; attempt < 100 && !existsSync(readyPath); attempt += 1) {
          await Bun.sleep(10);
        }
        expect(existsSync(readyPath)).toBe(true);
        const secondStartedAt = Date.now();
        const secondPreparing = second.prepare();
        const [firstPrepared, secondPrepared] = await Promise.all([
          firstPreparing,
          secondPreparing,
        ]);

        expect(firstPrepared.isOk()).toBe(true);
        expect(secondPrepared.isErr()).toBe(true);
        expect(Date.now() - secondStartedAt).toBeGreaterThanOrEqual(800);
        if (firstPrepared.isOk()) expect((await firstPrepared.value.release()).isOk()).toBe(true);
        expect(existsSync(join(dataRoot, "locks", "mutation.guard"))).toBe(false);
      } finally {
        rmSync(dataRoot, { force: true, recursive: true });
      }
    });
  }

  test("[CONFIG-FILE-STATE-006] transition guard creation preserves the underlying mkdir error", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "appaloft-guard-mkdir-error-"));
    const lifecycle = new SshRemoteStateLifecycle({
      dataRoot,
      target: { host: "127.0.0.1" },
      heartbeatIntervalMs: null,
      lockAcquireTimeoutMs: 0,
      runner: {
        run: ({ command }) => {
          const mkdirGuard = 'mkdir "$guard_dir" 2>&1';
          expect(command).toContain(mkdirGuard);
          return executeCommand(
            command.replace(mkdirGuard, "sh -c 'echo simulated-guard-ENOSPC >&2; exit 1' 2>&1"),
          );
        },
      },
    });

    try {
      const prepared = await lifecycle.prepare();

      expect(prepared.isErr()).toBe(true);
      if (prepared.isOk()) throw new Error("Expected guard creation failure");
      expect(JSON.stringify(prepared.error.details)).toContain("simulated-guard-ENOSPC");
      expect(existsSync(join(dataRoot, "locks", "mutation.guard"))).toBe(false);
    } finally {
      rmSync(dataRoot, { force: true, recursive: true });
    }
  });

  test("[CONFIG-FILE-STATE-003] prepare failure cleanup excludes a guarded replacement contender", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "appaloft-prepare-cleanup-race-"));
    const lifecycle = new SshRemoteStateLifecycle({
      dataRoot,
      target: { host: "127.0.0.1" },
      owner: "old-prepare-owner",
      correlationId: "old-prepare-correlation",
      heartbeatIntervalMs: null,
      lockAcquireTimeoutMs: 0,
      runner: {
        run: ({ command }) => {
          const detach = 'mv "$lock_dir" "$failed_lock_dir" 2>/dev/null';
          expect(command).toContain(detach);
          const raced = command.replace(
            detach,
            `if mkdir "$guard_dir" 2>/dev/null; then mv "$lock_dir" "$data_root/locks/.stale-prepare-old"; mkdir "$lock_dir"; printf '%s' new-prepare-owner > "$lock_dir/owner.json"; fi\n${detach}`,
          );
          return executeCommand(raced.replace("current_version=0", "false\ncurrent_version=0"));
        },
      },
    });

    try {
      const prepared = await lifecycle.prepare();

      expect(prepared.isErr()).toBe(true);
      expect(existsSync(join(dataRoot, "locks", "mutation.lock"))).toBe(false);
    } finally {
      rmSync(dataRoot, { force: true, recursive: true });
    }
  });
});
