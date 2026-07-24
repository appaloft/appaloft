import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  AcquireWorkspaceWriterLeaseCommand,
  AddWorkspaceCollaborationLaneCommand,
  AddWorkspaceCollaborationParticipantCommand,
  ApproveAgentTaskRunCommand,
  CancelAgentTaskRunCommand,
  type Command,
  type CommandBus,
  CreateAgentTaskRunCommand,
  CreateSandboxAgentRuntimeCommand,
  CreateSandboxCommand,
  CreateWorkspaceCollaborationCommand,
  createExecutionContext,
  DeliverAgentTaskRunCommand,
  ExecuteSandboxCommand,
  type ExecutionContextFactory,
  IssueWorkspaceCollaborationNativeAttachCommand,
  IssueWorkspaceCollaborationTerminalAccessCommand,
  ListAgentTaskRunsQuery,
  ListSandboxAgentRuntimesQuery,
  ListSandboxesQuery,
  ListWorkspaceCollaborationsQuery,
  type Query,
  type QueryBus,
  ResumeAgentTaskRunCommand,
  ShowAgentTaskRunQuery,
  ShowSandboxQuery,
  ShowWorkspaceCollaborationQuery,
  TerminateSandboxAgentRuntimeCommand,
  TerminateSandboxCommand,
} from "@appaloft/application";
import { err, ok } from "@appaloft/core";

describe("Agent Workspace CLI", () => {
  test("[AGENT-WS-CLI-012] creates Pi and OpenCode Workspaces through canonical public commands", async () => {
    const commands: Command<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: Command<T>) => {
        commands.push(command as Command<unknown>);
        if (command instanceof CreateSandboxCommand) {
          return ok({ sandboxId: `sbx_ws_${commands.length}`, status: "ready" } as T);
        }
        return ok({
          sandboxId: `sbx_ws_${commands.length - 1}`,
          runtimeId: `sar_ws_${commands.length}`,
          status: "ready",
        } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: Query<T>) => ok({ items: [] } as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) => createExecutionContext({ ...input, requestId: "req_workspace_cli" }),
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
    try {
      for (const harness of ["pi", "opencode"] as const) {
        await program.parseAsync([
          "node",
          "appaloft",
          "workspace",
          "create",
          "--harness",
          harness,
          "--sandbox-template",
          `sbt_${harness}`,
          "--isolation",
          "gvisor",
          "--cpu-millis",
          "1000",
          "--memory-bytes",
          "536870912",
          "--disk-bytes",
          "2147483648",
          "--max-processes",
          "32",
        ]);
      }
    } finally {
      process.stdout.write = write;
    }

    expect(commands[0]).toBeInstanceOf(CreateSandboxCommand);
    expect(commands[1]).toBeInstanceOf(CreateSandboxAgentRuntimeCommand);
    expect(commands[1]).toMatchObject({
      input: {
        sandboxId: "sbx_ws_1",
        harnessKey: "pi",
        harnessTemplateId: "aht_pi_managed_v1",
      },
    });
    expect(commands[2]).toBeInstanceOf(CreateSandboxCommand);
    expect(commands[3]).toBeInstanceOf(CreateSandboxAgentRuntimeCommand);
    expect(commands[3]).toMatchObject({
      input: {
        sandboxId: "sbx_ws_3",
        harnessKey: "opencode",
        harnessTemplateId: "aht_opencode_managed_v1",
      },
    });
  });

  test("[COLLAB-SURFACE-013] exposes collaboration creation, membership, lanes and access grants", async () => {
    const commands: Command<unknown>[] = [];
    const queries: Query<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: Command<T>) => {
        commands.push(command as Command<unknown>);
        return ok({ status: "active" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: Query<T>) => {
        queries.push(query as Query<unknown>);
        return ok({ items: [] } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) => createExecutionContext({ ...input, requestId: "req_collaboration_cli" }),
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
    try {
      await program.parseAsync([
        "node",
        "appaloft",
        "workspace",
        "collaboration",
        "create",
        "--name",
        "Issue 123",
        "--workspace-id",
        "sbx_builder",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "workspace",
        "collaboration",
        "participant",
        "add",
        "wsc_123",
        "--subject-kind",
        "agent-runtime",
        "--runtime-id",
        "sar_reviewer",
        "--workspace-id",
        "sbx_reviewer",
        "--role",
        "reviewer",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "workspace",
        "collaboration",
        "lane",
        "add",
        "wsc_123",
        "--workspace-id",
        "sbx_reviewer",
        "--purpose",
        "reviewer",
        "--label",
        "Review",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "workspace",
        "collaboration",
        "writer",
        "acquire",
        "wsc_123",
        "--lane-id",
        "wln_builder",
        "--expires-at",
        "2026-07-24T02:00:00.000Z",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "workspace",
        "collaboration",
        "terminal-access",
        "wsc_123",
        "--lane-id",
        "wln_builder",
        "--session-id",
        "term_builder",
        "--access",
        "write",
        "--generation",
        "1",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "workspace",
        "collaboration",
        "native-attach",
        "wsc_123",
        "--lane-id",
        "wln_builder",
        "--runtime-id",
        "sar_opencode",
        "--expires-at",
        "2026-07-24T02:00:00.000Z",
        "--generation",
        "1",
      ]);
      await program.parseAsync(["node", "appaloft", "workspace", "collaboration", "list"]);
      await program.parseAsync([
        "node",
        "appaloft",
        "workspace",
        "collaboration",
        "show",
        "wsc_123",
      ]);
    } finally {
      process.stdout.write = write;
    }

    expect(commands.map((command) => command.constructor)).toEqual([
      CreateWorkspaceCollaborationCommand,
      AddWorkspaceCollaborationParticipantCommand,
      AddWorkspaceCollaborationLaneCommand,
      AcquireWorkspaceWriterLeaseCommand,
      IssueWorkspaceCollaborationTerminalAccessCommand,
      IssueWorkspaceCollaborationNativeAttachCommand,
    ]);
    expect(commands[4]).toMatchObject({
      input: {
        collaborationId: "wsc_123",
        laneId: "wln_builder",
        sessionId: "term_builder",
        access: "write",
        expectedGeneration: 1,
      },
    });
    expect(queries[0]).toBeInstanceOf(ListWorkspaceCollaborationsQuery);
    expect(queries[1]).toBeInstanceOf(ShowWorkspaceCollaborationQuery);
  });

  test("[AGENT-WS-FLOW-003] lists and shows Workspace views without a Workspace repository", async () => {
    const queries: Query<unknown>[] = [];
    const queryBus = {
      execute: async <T>(_context: unknown, query: Query<T>) => {
        queries.push(query as Query<unknown>);
        if (query instanceof ListSandboxesQuery) {
          return ok({ items: [{ sandboxId: "sbx_workspace", status: "ready" }] } as T);
        }
        if (query instanceof ShowSandboxQuery) {
          return ok({ sandboxId: "sbx_workspace", status: "ready" } as T);
        }
        return ok({
          items: [
            {
              sandboxId: "sbx_workspace",
              runtimeId: "sar_workspace",
              harnessKey: "opencode",
              status: "ready",
            },
          ],
        } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) => createExecutionContext({ ...input, requestId: "req_workspace_read_cli" }),
    };
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: { execute: async () => ok(undefined) } as unknown as CommandBus,
      queryBus,
      executionContextFactory,
    });
    const write = process.stdout.write;
    process.stdout.write = (() => true) as typeof process.stdout.write;
    try {
      await program.parseAsync(["node", "appaloft", "workspace", "list"]);
      await program.parseAsync(["node", "appaloft", "workspace", "show", "sbx_workspace"]);
    } finally {
      process.stdout.write = write;
    }

    expect(queries.filter((query) => query instanceof ListSandboxesQuery)).toHaveLength(1);
    expect(queries.filter((query) => query instanceof ShowSandboxQuery)).toHaveLength(1);
    expect(queries.filter((query) => query instanceof ListSandboxAgentRuntimesQuery)).toHaveLength(
      2,
    );
  });

  test("[AGENT-WS-FLOW-003] terminates Agent Runtimes before deleting the Sandbox", async () => {
    const commands: Command<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: Command<T>) => {
        commands.push(command as Command<unknown>);
        return ok(
          command instanceof TerminateSandboxAgentRuntimeCommand
            ? ({
                sandboxId: "sbx_workspace",
                runtimeId: "sar_workspace",
                status: "terminated",
              } as T)
            : ({ sandboxId: "sbx_workspace", status: "terminated" } as T),
        );
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: Query<T>) => {
        expect(query).toBeInstanceOf(ListSandboxAgentRuntimesQuery);
        return ok({
          items: [
            {
              sandboxId: "sbx_workspace",
              runtimeId: "sar_workspace",
              harnessKey: "opencode",
              status: "ready",
            },
          ],
        } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) => createExecutionContext({ ...input, requestId: "req_workspace_delete" }),
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
    try {
      await program.parseAsync(["node", "appaloft", "workspace", "terminate", "sbx_workspace"]);
    } finally {
      process.stdout.write = write;
    }

    expect(commands).toHaveLength(2);
    expect(commands[0]).toBeInstanceOf(TerminateSandboxAgentRuntimeCommand);
    expect(commands[1]).toBeInstanceOf(TerminateSandboxCommand);
  });

  test("[AGENT-WS-SOURCE-014] materializes repository and branch before Runtime creation", async () => {
    const commands: Command<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: Command<T>) => {
        commands.push(command as Command<unknown>);
        if (command instanceof CreateSandboxCommand) {
          return ok({ sandboxId: "sbx_source_cli", status: "ready" } as T);
        }
        if (command instanceof ExecuteSandboxCommand) {
          return ok({
            mode: "foreground",
            frames: [{ kind: "exit", exitCode: 0 }],
          } as T);
        }
        return ok({
          sandboxId: "sbx_source_cli",
          runtimeId: "sar_source_cli",
          status: "ready",
        } as T);
      },
    } as unknown as CommandBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({ ...input, requestId: "req_workspace_source_cli" }),
    };
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus: { execute: async () => ok({ items: [] }) } as unknown as QueryBus,
      executionContextFactory,
    });
    const write = process.stdout.write;
    process.stdout.write = (() => true) as typeof process.stdout.write;
    try {
      await program.parseAsync([
        "node",
        "appaloft",
        "workspace",
        "create",
        "--harness",
        "opencode",
        "--sandbox-template",
        "sbt_opencode",
        "--isolation",
        "gvisor",
        "--cpu-millis",
        "1000",
        "--memory-bytes",
        "536870912",
        "--disk-bytes",
        "2147483648",
        "--max-processes",
        "32",
        "--repo",
        "https://github.com/acme/web.git",
        "--ref",
        "main",
        "--branch",
        "agent/issue-123",
      ]);
    } finally {
      process.stdout.write = write;
    }

    expect(commands[0]).toBeInstanceOf(CreateSandboxCommand);
    expect(commands[0]).toMatchObject({
      input: {
        networkPolicy: {
          mode: "allowlist",
          rules: [
            { kind: "domain", value: "github.com", ports: [443] },
            { kind: "domain", value: "api.github.com", ports: [443] },
          ],
        },
      },
    });
    expect(commands[1]).toMatchObject({
      input: {
        sandboxId: "sbx_source_cli",
        argv: ["git", "clone", "--branch", "main", "--", "https://github.com/acme/web.git", "."],
      },
    });
    expect(commands[2]).toMatchObject({
      input: {
        sandboxId: "sbx_source_cli",
        argv: ["git", "switch", "-c", "agent/issue-123"],
      },
    });
    expect(commands[3]).toBeInstanceOf(CreateSandboxAgentRuntimeCommand);
  });

  test("[AGENT-WS-CLI-012] preserves partial Workspace recovery evidence", async () => {
    const commandBus = {
      execute: async <T>(_context: unknown, command: Command<T>) => {
        if (command instanceof CreateSandboxCommand) {
          return ok({ sandboxId: "sbx_partial", status: "ready" } as T);
        }
        return err({
          code: "sandbox_agent_harness_unavailable",
          category: "user",
          message: "OpenCode harness is not configured",
          retryable: false,
          details: {},
        });
      },
    } as unknown as CommandBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) => createExecutionContext({ ...input, requestId: "req_workspace_partial" }),
    };
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus: { execute: async () => ok({ items: [] }) } as unknown as QueryBus,
      executionContextFactory,
    });

    const originalExitCode = process.exitCode;
    const write = process.stderr.write;
    process.stderr.write = (() => true) as typeof process.stderr.write;
    try {
      await program.parseAsync([
        "node",
        "appaloft",
        "workspace",
        "create",
        "--harness",
        "opencode",
        "--sandbox-template",
        "sbt_opencode",
        "--isolation",
        "gvisor",
        "--cpu-millis",
        "1000",
        "--memory-bytes",
        "536870912",
        "--disk-bytes",
        "2147483648",
        "--max-processes",
        "32",
      ]);
      throw new Error("Expected partial Workspace creation to fail");
    } catch (error) {
      const errorText = String(error);
      expect(errorText).toContain('"code":"sandbox_agent_harness_unavailable"');
      expect(errorText).toContain('"phase":"agent-workspace-runtime-create"');
      expect(errorText).toContain('"workspaceId":"sbx_partial"');
      expect(errorText).toContain('"sandboxId":"sbx_partial"');
      expect(errorText).toContain('"harness":"opencode"');
    } finally {
      process.stderr.write = write;
      process.exitCode = originalExitCode ?? 0;
    }
  });

  test("[AGENT-TASK-RUN-001][AGENT-TASK-RESUME-002][AGENT-TASK-CHECK-003][AGENT-TASK-DIFF-004][AGENT-TASK-PREVIEW-005][AGENT-TASK-ARTIFACT-006][AGENT-TASK-APPROVE-007][AGENT-TASK-PR-008][AGENT-TASK-CANCEL-009] dispatches the complete Task workflow through canonical operations", async () => {
    const commands: Command<unknown>[] = [];
    const queries: Query<unknown>[] = [];
    const task = {
      schemaVersion: "agent-task-run/v1",
      taskRunId: "srun_task_cli",
      runId: "srun_task_cli",
      workspaceId: "sbx_task_cli",
      runtimeId: "sar_task_cli",
      status: "running",
      plan: { checks: [], immutableReview: false, sourceRoot: "." },
      agentRun: { runId: "srun_task_cli", status: "running" },
      checks: [],
      createdAt: "2026-07-23T00:00:00.000Z",
      updatedAt: "2026-07-23T00:00:00.000Z",
    };
    const commandBus = {
      execute: async <T>(_context: unknown, command: Command<T>) => {
        commands.push(command as Command<unknown>);
        if (command instanceof ResumeAgentTaskRunCommand) {
          return ok({ ...task, status: "awaiting-approval" } as T);
        }
        if (command instanceof ApproveAgentTaskRunCommand) {
          return ok({ ...task, status: "approved" } as T);
        }
        if (command instanceof DeliverAgentTaskRunCommand) {
          return ok({
            ...task,
            status: "delivered",
            delivery: {
              remote: "origin",
              branch: "agent/issue-123",
              commitSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              pullRequestUrl: "https://github.com/acme/web/pull/42",
            },
          } as T);
        }
        if (command instanceof CancelAgentTaskRunCommand) {
          return ok({ ...task, status: "cancelled" } as T);
        }
        if (command instanceof CreateAgentTaskRunCommand) {
          return ok(task as T);
        }
        throw new Error(`Unexpected Task command ${command.constructor.name}`);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: Query<T>) => {
        queries.push(query as Query<unknown>);
        if (query instanceof ListAgentTaskRunsQuery) {
          return ok({ items: [task] } as T);
        }
        if (query instanceof ShowAgentTaskRunQuery) {
          return ok(task as T);
        }
        throw new Error(`Unexpected Task query ${query.constructor.name}`);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) => createExecutionContext({ ...input, requestId: "req_workspace_task_cli" }),
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
    try {
      await program.parseAsync([
        "node",
        "appaloft",
        "workspace",
        "task",
        "run",
        "sbx_task_cli",
        "--runtime-id",
        "sar_task_cli",
        "--task",
        "Fix issue #123",
        "--check-arg",
        "bun",
        "--check-arg",
        "test",
        "--preview-start-arg",
        "bun",
        "--preview-start-arg",
        "run",
        "--preview-start-arg",
        "dev",
        "--preview-port",
        "3000",
        "--preview-expires-at",
        "2026-07-24T00:00:00.000Z",
        "--immutable-review",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "workspace",
        "task",
        "list",
        "sbx_task_cli",
        "--runtime-id",
        "sar_task_cli",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "workspace",
        "task",
        "show",
        "sbx_task_cli",
        "srun_task_cli",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "workspace",
        "task",
        "resume",
        "sbx_task_cli",
        "srun_task_cli",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "workspace",
        "task",
        "approve",
        "sbx_task_cli",
        "srun_task_cli",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "workspace",
        "task",
        "deliver",
        "sbx_task_cli",
        "srun_task_cli",
        "--commit-message",
        "Fix issue #123",
        "--branch",
        "agent/issue-123",
        "--pull-request-title",
        "Fix issue #123",
        "--pull-request-body",
        "Automated task result",
        "--pull-request-base",
        "main",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "workspace",
        "task",
        "cancel",
        "sbx_task_cli",
        "srun_task_cli",
      ]);
    } finally {
      process.stdout.write = write;
    }

    const create = commands.find(
      (command): command is CreateAgentTaskRunCommand =>
        command instanceof CreateAgentTaskRunCommand,
    );
    expect(create?.input).toMatchObject({
      workspaceId: "sbx_task_cli",
      runtimeId: "sar_task_cli",
      task: "Fix issue #123",
      checks: [{ name: "check", argv: ["bun", "test"], required: true }],
      preview: {
        startArgv: ["bun", "run", "dev"],
        port: 3000,
        visibility: "private",
      },
      immutableReview: true,
    });
    expect(queries.some((query) => query instanceof ListAgentTaskRunsQuery)).toBeTrue();
    expect(queries.some((query) => query instanceof ShowAgentTaskRunQuery)).toBeTrue();
    expect(commands.some((command) => command instanceof ResumeAgentTaskRunCommand)).toBeTrue();
    expect(commands.some((command) => command instanceof ApproveAgentTaskRunCommand)).toBeTrue();
    expect(commands.some((command) => command instanceof CancelAgentTaskRunCommand)).toBeTrue();
    const delivery = commands.find(
      (command): command is DeliverAgentTaskRunCommand =>
        command instanceof DeliverAgentTaskRunCommand,
    );
    expect(delivery?.input).toMatchObject({
      branch: "agent/issue-123",
      remote: "origin",
      pullRequest: {
        provider: "github",
        title: "Fix issue #123",
        body: "Automated task result",
        base: "main",
      },
    });
    expect(commands.some((command) => command instanceof ExecuteSandboxCommand)).toBeFalse();
  });
});
