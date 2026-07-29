import { describe, expect, test } from "bun:test";
import { createExecutionContext } from "@appaloft/application";
import { ok } from "@appaloft/core";
import { GitHubRepositoryWorkspaceMaterializerAdapter } from "../src";

describe("GitHub Repository Workspace materializer", () => {
  test("[GH-AUTO-BOUNDARY-021] materializes through public Sandbox operations without token argv", async () => {
    const argv: string[][] = [];
    const written: Array<{ path: string; content: string }> = [];
    const adapter = new GitHubRepositoryWorkspaceMaterializerAdapter(
      {
        writeFile: async (_context, _sandboxId, input) => {
          written.push({ path: input.path, content: new TextDecoder().decode(input.content) });
          return ok({ path: input.path, sizeBytes: input.content.byteLength });
        },
        exec: async (_context, _sandboxId, input) => {
          argv.push([...input.argv]);
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
    expect(written.some((file) => file.content === "installation-token-value\n")).toBe(true);
    expect(JSON.stringify(argv)).not.toContain("installation-token-value");
    expect(argv).toContainEqual(["git", "fetch", "--no-tags", "origin", "a".repeat(40)]);
    expect(argv).toContainEqual(["git", "checkout", "--detach", "a".repeat(40)]);
    expect(argv).toContainEqual(["rm", "-f", ".appaloft-github-token", ".appaloft-git-askpass"]);
  });

  test("[GH-AUTO-BOUNDARY-021] fails closed when the exact source pin is missing", async () => {
    const adapter = new GitHubRepositoryWorkspaceMaterializerAdapter(
      {
        writeFile: async (_context, _sandboxId, input) =>
          ok({ path: input.path, sizeBytes: input.content.byteLength }),
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
});
