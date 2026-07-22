import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  AcceptSandboxPromotionCommand,
  type Command,
  type CommandBus,
  CreateSandboxAgentRunCommand,
  CreateSandboxAgentRuntimeCommand,
  CreateSandboxCandidatePreviewCommand,
  CreateSandboxSourceArtifactCommand,
  createExecutionContext,
  type ExecutionContextFactory,
  PlanSandboxPromotionCommand,
  type Query,
  type QueryBus,
  ResolveSandboxAgentApprovalCommand,
  StreamSandboxAgentRunEventsQuery,
} from "@appaloft/application";
import { ok } from "@appaloft/core";

describe("CLI sandbox agent delivery commands", () => {
  test("[SBX-CLI-AGENT-001] maps the agent-to-promotion chain to shared commands", async () => {
    const commands: Command<unknown>[] = [];
    const queries: Query<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: Command<T>) => {
        commands.push(command as Command<unknown>);
        return ok({ status: "accepted" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: Query<T>) => {
        queries.push(query as Query<unknown>);
        if (query instanceof StreamSandboxAgentRunEventsQuery) {
          return ok({
            mode: "stream",
            runId: "srun_cli",
            stream: {
              async *[Symbol.asyncIterator]() {
                yield {
                  kind: "closed",
                  schemaVersion: "sandbox-agent.run-events/v1",
                  runId: "srun_cli",
                  reason: "terminal",
                };
              },
              async close() {},
            },
          } as T);
        }
        return ok({ items: [] } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) => createExecutionContext({ ...input, requestId: "req_agent_cli" }),
    };
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });
    const write = process.stdout.write;
    process.stdout.write = (() => true) as typeof process.stdout.write;
    const digest = `sha256:${"a".repeat(64)}`;
    try {
      await program.parseAsync([
        "node",
        "appaloft",
        "sandbox",
        "agent",
        "runtime",
        "create",
        "sbx_cli",
        "--idempotency-key",
        "runtime-cli",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "sandbox",
        "agent",
        "run",
        "create",
        "sbx_cli",
        "srt_cli",
        "--task",
        "Build it",
        "--idempotency-key",
        "run-cli",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "sandbox",
        "agent",
        "run",
        "events",
        "srun_cli",
        "--follow",
        "--after-sequence",
        "2",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "sandbox",
        "agent",
        "approval",
        "resolve",
        "sapp_cli",
        "--decision",
        "approve",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "sandbox",
        "artifact",
        "create",
        "sbx_cli",
        "--source-root",
        "/workspace",
      ]);
      await program.parseAsync(["node", "appaloft", "sandbox", "preview", "create", "sart_cli"]);
      await program.parseAsync([
        "node",
        "appaloft",
        "sandbox",
        "promote",
        "plan",
        "sbx_cli",
        "sart_cli",
        "--digest",
        digest,
        "--preview-id",
        "sprev_cli",
        "--project-id",
        "prj_cli",
        "--environment-id",
        "env_cli",
        "--resource-name",
        "agent-app",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "sandbox",
        "promote",
        "accept",
        "sprom_cli",
        "--digest",
        digest,
        "--idempotency-key",
        "accept-cli",
      ]);
    } finally {
      process.stdout.write = write;
    }

    expect(commands.map((command) => command.constructor)).toEqual([
      CreateSandboxAgentRuntimeCommand,
      CreateSandboxAgentRunCommand,
      ResolveSandboxAgentApprovalCommand,
      CreateSandboxSourceArtifactCommand,
      CreateSandboxCandidatePreviewCommand,
      PlanSandboxPromotionCommand,
      AcceptSandboxPromotionCommand,
    ]);
    expect(commands[1]).toMatchObject({
      input: { runtimeId: "srt_cli", context: { mode: "fresh" }, task: "Build it" },
    });
    expect(commands.at(-1)).toMatchObject({
      input: { promotionId: "sprom_cli", expectedArtifactDigest: digest },
    });
    expect(queries).toContainEqual(
      expect.objectContaining({
        constructor: StreamSandboxAgentRunEventsQuery,
        input: { runId: "srun_cli", afterSequence: 2 },
      }),
    );
  });
});
