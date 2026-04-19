import { describe, expect, test } from "bun:test";
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
    expect(commands[0]?.command).toContain("schema-version.json");
    expect(commands[0]?.command).toContain("mutation.lock");
    expect(commands[0]?.command).toContain("backups");
    expect(commands[0]?.command).toContain("journals");
    expect(commands[0]?.command).toContain("server-applied-routes");
    expect(commands[0]?.command).not.toContain("OPENSSH PRIVATE KEY");

    const released = await prepared.value.release();

    expect(released.isOk()).toBe(true);
    expect(commands).toHaveLength(2);
    expect(commands[1]?.command).toContain("rm -rf");
    expect(commands[1]?.command).toContain("mutation.lock");
  });

  test("[CONFIG-FILE-STATE-003] SSH adapter maps remote lock conflicts", async () => {
    const lifecycle = new SshRemoteStateLifecycle({
      dataRoot: "/var/lib/appaloft/runtime/state",
      target: {
        host: "203.0.113.10",
        port: 22,
        username: "deploy",
      },
      runner: {
        run: async () => ({
          exitCode: 73,
          stdout: "",
          stderr: '{"owner":"first","correlationId":"run_1"}',
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
      details: {
        phase: "remote-state-lock",
        stateBackend: "ssh-pglite",
        host: "203.0.113.10",
        port: "22",
      },
    });
    expect(JSON.stringify(prepared.error)).not.toContain("OPENSSH PRIVATE KEY");
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
});
