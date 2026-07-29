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
  OpenAgentWorkspaceCommand,
  type Query,
  type QueryBus,
  ResumeAgentTaskRunCommand,
  ShowAgentTaskRunQuery,
  ShowSandboxQuery,
  ShowTerminalSessionQuery,
  ShowWorkspaceCollaborationQuery,
  SteerAgentTaskRunCommand,
  StopAgentTaskRunCommand,
  type TerminalSession,
  type TerminalSessionAttachmentGateway,
  type TerminalSessionFrame,
  TerminateSandboxAgentRuntimeCommand,
  TerminateSandboxCommand,
} from "@appaloft/application";
import { err, ok } from "@appaloft/core";

describe("Agent Workspace CLI", () => {
  test("[WS-CREATE-PROFILE-009][WS-OPEN-PROFILE-006][WS-OPEN-SURFACE-019] creates Profile-aware Workspaces without Agent-name branching", async () => {
    const commands: Command<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: Command<T>) => {
        commands.push(command as Command<unknown>);
        return ok({
          workspaceId: `sbx_ws_${commands.length}`,
          resumed: false,
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
      resolveRemoteWorkspaceGitRef: async (repository, ref) => ({
        repositoryIdentity: "github.com/Acme/Web",
        credentialFreeHttpsRepository: repository,
        ref,
        commitSha: "0123456789abcdef0123456789abcdef01234567",
      }),
    });
    const write = process.stdout.write;
    process.stdout.write = (() => true) as typeof process.stdout.write;
    try {
      for (const profile of ["pi-default", "opencode-default"] as const) {
        await program.parseAsync([
          "node",
          "appaloft",
          "workspace",
          "create",
          "--profile",
          profile,
          "--repo",
          "https://github.com/Acme/Web.git",
          "--ref",
          "refs/heads/main",
          "--branch",
          "main",
        ]);
      }
    } finally {
      process.stdout.write = write;
    }

    expect(commands).toHaveLength(2);
    expect(commands[0]).toBeInstanceOf(OpenAgentWorkspaceCommand);
    expect(commands[0]).toMatchObject({
      input: {
        profile: "pi-default",
        repositoryIdentity: "github.com/Acme/Web",
        commitSha: "0123456789abcdef0123456789abcdef01234567",
        forceNew: true,
      },
    });
    expect(commands[1]).toBeInstanceOf(OpenAgentWorkspaceCommand);
    expect(commands[1]).toMatchObject({
      input: {
        profile: "opencode-default",
      },
    });
  });

  test("[WS-OPEN-GIT-001][WS-OPEN-SURFACE-019] opens from local Git context through one application command", async () => {
    const commands: Command<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: Command<T>) => {
        commands.push(command as Command<unknown>);
        return ok({ workspaceId: "sbx_local", resumed: true } as T);
      },
    } as unknown as CommandBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) => createExecutionContext({ ...input, requestId: "req_workspace_open_cli" }),
    };
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus: { execute: async () => ok({}) } as unknown as QueryBus,
      executionContextFactory,
      resolveLocalWorkspaceGitContext: async (path) => ({
        root: "/work/repository",
        remoteName: "origin",
        remote: "git@github.com:Acme/Web.git",
        repositoryIdentity: "github.com/Acme/Web",
        credentialFreeHttpsRepository: "https://github.com/Acme/Web.git",
        branch: "feature/open",
        ref: "refs/heads/feature/open",
        headSha: "0123456789abcdef0123456789abcdef01234567",
        ...(path === "." ? {} : { root: path }),
      }),
    });
    const write = process.stdout.write;
    process.stdout.write = (() => true) as typeof process.stdout.write;
    try {
      await program.parseAsync([
        "node",
        "appaloft",
        "workspace",
        "open",
        ".",
        "--profile",
        "opencode-default",
        "--new",
        "--no-attach",
      ]);
    } finally {
      process.stdout.write = write;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(OpenAgentWorkspaceCommand);
    expect(commands[0]).toMatchObject({
      input: {
        repository: "https://github.com/Acme/Web.git",
        repositoryIdentity: "github.com/Acme/Web",
        branch: "feature/open",
        commitSha: "0123456789abcdef0123456789abcdef01234567",
        profile: "opencode-default",
        forceNew: true,
        attach: false,
      },
    });
  });

  test("[WS-ATTACH-MANAGED-014] automatically connects a managed-terminal attach descriptor", async () => {
    const attached: string[] = [];
    const output: string[] = [];
    const frames: TerminalSessionFrame[] = [
      { kind: "ready", sessionId: "term_pi" },
      { kind: "output", stream: "stdout", data: "Pi ready\n" },
      { kind: "closed", reason: "source-ended", exitCode: 0 },
    ];
    const session: TerminalSession = {
      write: async () => {},
      resize: async () => {},
      detach: async () => {},
      close: async () => {},
      async *[Symbol.asyncIterator]() {
        for (const frame of frames) yield frame;
      },
    };
    const gateway: TerminalSessionAttachmentGateway = {
      attach: (sessionId) => {
        attached.push(sessionId);
        return ok(session);
      },
    };
    const commandBus = {
      execute: async <T>() =>
        ok({
          workspaceId: "sbx_pi",
          resumed: false,
          attach: {
            transport: "managed-terminal",
            sessionId: "term_pi",
          },
        } as T),
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: Query<T>) => {
        expect(query).toBeInstanceOf(ShowTerminalSessionQuery);
        return ok({
          schemaVersion: "terminal-sessions.show/v1",
          item: {
            sessionId: "term_pi",
            scope: "sandbox",
            sandboxId: "sbx_pi",
            transport: {
              kind: "websocket",
              path: "/api/terminal-sessions/term_pi/attach",
            },
            providerKey: "managed-agent",
            createdAt: "2026-07-28T00:00:00.000Z",
            status: "active",
          },
        } as T);
      },
    } as unknown as QueryBus;
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory: {
        create: (input) =>
          createExecutionContext({ ...input, requestId: "req_workspace_managed_attach_cli" }),
      },
      terminalSessionGateway: gateway,
      terminalIO: {
        stdin: {
          isTTY: false,
          on: () => {},
          removeListener: () => {},
        },
        stdout: { write: (data) => output.push(String(data)) },
        stderr: { write: () => {} },
      },
      resolveLocalWorkspaceGitContext: async () => ({
        root: "/work/repository",
        remoteName: "origin",
        remote: "git@github.com:Acme/Web.git",
        repositoryIdentity: "github.com/Acme/Web",
        credentialFreeHttpsRepository: "https://github.com/Acme/Web.git",
        branch: "main",
        ref: "refs/heads/main",
        headSha: "0123456789abcdef0123456789abcdef01234567",
      }),
    });

    await program.parseAsync(["node", "appaloft", "workspace", "open", "."]);

    expect(attached).toEqual(["term_pi"]);
    expect(output.join("")).toBe("Pi ready\n");
  });

  test("[WS-ATTACH-NATIVE-015] executes the Adapter-declared native client handoff without a shell", async () => {
    const launched: string[][] = [];
    const commandBus = {
      execute: async <T>() =>
        ok({
          workspaceId: "sbx_opencode",
          resumed: false,
          attach: {
            workspaceId: "sbx_opencode",
            runtimeId: "sar_opencode",
            transport: "native-attach",
            access: {
              exposureId: "sbp_opencode",
              port: 4096,
              visibility: "private",
              url: "https://attach.example.test/capability",
              expiresAt: "2026-07-28T01:00:00.000Z",
            },
            clientCommand: [
              "opencode",
              "attach",
              "https://attach.example.test/capability",
              "--dir",
              "/workspace",
            ],
            clientHandoff: "local-client-exec",
          },
        } as T),
    } as unknown as CommandBus;
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus: { execute: async () => ok({}) } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) =>
          createExecutionContext({ ...input, requestId: "req_workspace_native_attach_cli" }),
      },
      resolveLocalWorkspaceGitContext: async () => ({
        root: "/work/repository",
        remoteName: "origin",
        remote: "git@github.com:Acme/Web.git",
        repositoryIdentity: "github.com/Acme/Web",
        credentialFreeHttpsRepository: "https://github.com/Acme/Web.git",
        branch: "main",
        ref: "refs/heads/main",
        headSha: "0123456789abcdef0123456789abcdef01234567",
      }),
      launchNativeWorkspaceClient: async (argv) => {
        launched.push([...argv]);
      },
    });

    await program.parseAsync(["node", "appaloft", "workspace", "open", "."]);

    expect(launched).toEqual([
      ["opencode", "attach", "https://attach.example.test/capability", "--dir", "/workspace"],
    ]);
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

  test("[WS-OPEN-CREATE-009] dispatches an exact remote source pin to the application workflow", async () => {
    const commands: Command<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: Command<T>) => {
        commands.push(command as Command<unknown>);
        return ok({
          workspaceId: "sbx_source_cli",
          resumed: false,
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
      resolveRemoteWorkspaceGitRef: async () => ({
        repositoryIdentity: "github.com/acme/web",
        credentialFreeHttpsRepository: "https://github.com/acme/web.git",
        ref: "refs/heads/main",
        commitSha: "0123456789abcdef0123456789abcdef01234567",
      }),
    });
    const write = process.stdout.write;
    process.stdout.write = (() => true) as typeof process.stdout.write;
    try {
      await program.parseAsync([
        "node",
        "appaloft",
        "workspace",
        "create",
        "--profile",
        "opencode-default",
        "--repo",
        "https://github.com/acme/web.git",
        "--ref",
        "refs/heads/main",
        "--branch",
        "agent/issue-123",
      ]);
    } finally {
      process.stdout.write = write;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(OpenAgentWorkspaceCommand);
    expect(commands[0]).toMatchObject({
      input: {
        repository: "https://github.com/acme/web.git",
        repositoryIdentity: "github.com/acme/web",
        ref: "refs/heads/main",
        branch: "agent/issue-123",
        commitSha: "0123456789abcdef0123456789abcdef01234567",
        profile: "opencode-default",
        forceNew: true,
      },
    });
  });

  test("[WS-OPEN-PARTIAL-012] preserves partial Workspace recovery evidence", async () => {
    const commandBus = {
      execute: async <T>(_context: unknown, _command: Command<T>) => {
        return err({
          code: "sandbox_agent_harness_unavailable",
          category: "user",
          message: "OpenCode harness is not configured",
          retryable: false,
          details: {
            phase: "workspace-open-runtime-create",
            workspaceId: "sbx_partial",
            sandboxId: "sbx_partial",
            runtimeId: "sar_partial",
            recovery: "appaloft workspace open . --no-attach",
            terminate: "appaloft workspace terminate sbx_partial",
          },
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
      resolveRemoteWorkspaceGitRef: async () => ({
        repositoryIdentity: "github.com/acme/web",
        credentialFreeHttpsRepository: "https://github.com/acme/web.git",
        ref: "refs/heads/main",
        commitSha: "0123456789abcdef0123456789abcdef01234567",
      }),
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
        "--profile",
        "opencode-default",
        "--repo",
        "https://github.com/acme/web.git",
        "--ref",
        "refs/heads/main",
        "--branch",
        "main",
      ]);
      throw new Error("Expected partial Workspace creation to fail");
    } catch (error) {
      const errorText = String(error);
      expect(errorText).toContain('"code":"sandbox_agent_harness_unavailable"');
      expect(errorText).toContain('"phase":"workspace-open-runtime-create"');
      expect(errorText).toContain('"workspaceId":"sbx_partial"');
      expect(errorText).toContain('"sandboxId":"sbx_partial"');
      expect(errorText).toContain('"runtimeId":"sar_partial"');
    } finally {
      process.stderr.write = write;
      process.exitCode = originalExitCode ?? 0;
    }
  });

  test("[AGENT-TASK-RUN-001][AGENT-TASK-RESUME-002][AGENT-TASK-CHECK-003][AGENT-TASK-DIFF-004][AGENT-TASK-PREVIEW-005][AGENT-TASK-ARTIFACT-006][AGENT-TASK-APPROVE-007][AGENT-TASK-PR-008][AGENT-TASK-CANCEL-009][GH-AUTO-CONTROL-010][GH-AUTO-SURFACE-019] dispatches the complete Task workflow through canonical operations", async () => {
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
        if (command instanceof StopAgentTaskRunCommand) {
          return ok({ ...task, status: "stopped" } as T);
        }
        if (command instanceof SteerAgentTaskRunCommand) {
          return ok(task as T);
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
        "stop",
        "sbx_task_cli",
        "srun_task_cli",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "workspace",
        "task",
        "steer",
        "sbx_task_cli",
        "srun_task_cli",
        "--instruction",
        "Keep the existing API compatible",
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
    expect(commands.some((command) => command instanceof StopAgentTaskRunCommand)).toBeTrue();
    expect(
      commands.find((command) => command instanceof SteerAgentTaskRunCommand)?.input,
    ).toMatchObject({
      instruction: "Keep the existing API compatible",
      taskRunId: "srun_task_cli",
      workspaceId: "sbx_task_cli",
    });
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
