import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import { createExecutionContext } from "@appaloft/application";
import { ok } from "@appaloft/core";
import { GitHubRepositoryWorkspaceMaterializerAdapter } from "../src";

describe("GitHub Repository Workspace materializer", () => {
  test("[GH-AUTO-BOUNDARY-021] materializes through public Sandbox operations without token argv", async () => {
    const commands: Array<{ argv: string[]; stdin?: string }> = [];
    const adapter = new GitHubRepositoryWorkspaceMaterializerAdapter(
      {
        exec: async (_context, _sandboxId, input) => {
          commands.push({
            argv: [...input.argv],
            ...(input.stdin ? { stdin: new TextDecoder().decode(input.stdin) } : {}),
          });
          return ok({
            mode: "foreground",
            frames: [{ kind: "exit", sequence: 1, exitCode: 0 }],
          });
        },
      },
      async () => "installation-token-value",
    );
    const result = await adapter.materialize(
      createExecutionContext({ entrypoint: "worker", requestId: "req_materialize" }),
      {
        trigger: {
          provider: "github",
          sourceEventId: "sevt_1",
          event: "issue_comment",
          action: "created",
          deliveryId: "delivery_1",
          installationId: "98765",
          repository: { id: "123456", fullName: "appaloft/example" },
          sender: { id: "303" },
          thread: { kind: "issue", number: 41 },
          source: { ref: "main", headSha: "a".repeat(40) },
        },
        workspaceId: "workspace_1",
        mode: "write",
      },
    );

    expect(result.isOk()).toBe(true);
    expect(JSON.stringify(commands.map(({ argv }) => argv))).not.toContain(
      "installation-token-value",
    );
    expect(JSON.stringify(commands)).not.toContain("GIT_ASKPASS");
    expect(JSON.stringify(commands)).not.toContain(".appaloft-git-askpass");
    const approval = commands.find(({ argv }) => argv.includes("approve"));
    const fetch = commands.find(({ argv }) => argv.includes("fetch"));
    expect(approval?.stdin).toBe(
      "protocol=https\nhost=github.com\nusername=x-access-token\npassword=installation-token-value\n\n",
    );
    expect(fetch?.stdin).toBeUndefined();
    expect(fetch?.argv).toContain(
      "credential.helper=cache --timeout=60 --socket=/tmp/.appaloft-workspace-source-credential/credential-cache.sock",
    );
    expect(fetch?.argv).toContain("credential.interactive=never");
    expect(fetch?.argv).toContain("core.askPass=/bin/false");
    expect(commands.some(({ argv }) => argv.includes("clone"))).toBe(false);
    expect(commands.map(({ argv }) => argv)).toContainEqual([
      "git",
      "credential-cache",
      "--socket=/tmp/.appaloft-workspace-source-credential/credential-cache.sock",
      "exit",
    ]);
    expect(commands.map(({ argv }) => argv)).toContainEqual([
      "rmdir",
      "/tmp/.appaloft-workspace-source-credential",
    ]);
  });

  test("[GH-AUTO-BOUNDARY-021] fails closed when the exact source pin is missing", async () => {
    const adapter = new GitHubRepositoryWorkspaceMaterializerAdapter(
      {
        exec: async () =>
          ok({
            mode: "foreground",
            frames: [{ kind: "exit", sequence: 1, exitCode: 0 }],
          }),
      },
      async () => "installation-token-value",
    );
    const result = await adapter.materialize(
      createExecutionContext({ entrypoint: "worker", requestId: "req_missing_pin" }),
      {
        trigger: {
          provider: "github",
          sourceEventId: "sevt_2",
          event: "issue_comment",
          action: "created",
          deliveryId: "delivery_2",
          installationId: "98765",
          repository: { id: "123456", fullName: "appaloft/example" },
          sender: { id: "303" },
          thread: { kind: "issue", number: 41 },
        },
        workspaceId: "workspace_2",
        mode: "write",
      },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().details?.code).toBe(
      "github_agent_checkout_source_pin_missing",
    );
  });

  test("[GH-AUTO-BOUNDARY-021] cleans the credential cache after fetch failure", async () => {
    const argv: string[][] = [];
    const adapter = new GitHubRepositoryWorkspaceMaterializerAdapter(
      {
        exec: async (_context, _sandboxId, input) => {
          argv.push([...input.argv]);
          return ok({
            mode: "foreground",
            frames: [
              {
                kind: "exit",
                sequence: 1,
                exitCode: input.argv.includes("fetch") ? 1 : 0,
              },
            ],
          });
        },
      },
      async () => "installation-token-value",
    );
    const result = await adapter.materialize(
      createExecutionContext({ entrypoint: "worker", requestId: "req_fetch_failure" }),
      {
        trigger: {
          provider: "github",
          sourceEventId: "sevt_3",
          event: "issue_comment",
          action: "created",
          deliveryId: "delivery_3",
          installationId: "98765",
          repository: { id: "123456", fullName: "appaloft/example" },
          sender: { id: "303" },
          thread: { kind: "issue", number: 41 },
          source: { ref: "main", headSha: "a".repeat(40) },
        },
        workspaceId: "workspace_3",
        mode: "write",
      },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().details?.code).toBe("github_agent_checkout_failed");
    expect(argv).toContainEqual([
      "git",
      "credential-cache",
      "--socket=/tmp/.appaloft-workspace-source-credential/credential-cache.sock",
      "exit",
    ]);
    expect(argv.at(-1)).toEqual(["rmdir", "/tmp/.appaloft-workspace-source-credential"]);
  });

  test("[GH-AUTO-BOUNDARY-021] fails closed when credential cache cleanup fails", async () => {
    const argv: string[][] = [];
    const adapter = new GitHubRepositoryWorkspaceMaterializerAdapter(
      {
        exec: async (_context, _sandboxId, input) => {
          argv.push([...input.argv]);
          const cleanupFailed =
            input.argv.includes("credential-cache") && input.argv.includes("exit");
          return ok({
            mode: "foreground",
            frames: [{ kind: "exit", sequence: 1, exitCode: cleanupFailed ? 1 : 0 }],
          });
        },
      },
      async () => "installation-token-value",
    );
    const result = await adapter.materialize(
      createExecutionContext({ entrypoint: "worker", requestId: "req_cleanup_failure" }),
      {
        trigger: {
          provider: "github",
          sourceEventId: "sevt_4",
          event: "issue_comment",
          action: "created",
          deliveryId: "delivery_4",
          installationId: "98765",
          repository: { id: "123456", fullName: "appaloft/example" },
          sender: { id: "303" },
          thread: { kind: "issue", number: 41 },
          source: { ref: "main", headSha: "a".repeat(40) },
        },
        workspaceId: "workspace_4",
        mode: "write",
      },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().details?.code).toBe(
      "github_agent_checkout_credential_cleanup_failed",
    );
    expect(argv.at(-1)).toEqual(["rmdir", "/tmp/.appaloft-workspace-source-credential"]);
    expect(argv.some((command) => command.includes("checkout"))).toBe(false);
  });
});
