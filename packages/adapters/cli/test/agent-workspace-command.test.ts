import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  ListResourcesQuery,
  ListSandboxAgentRuntimesQuery,
  ListSandboxesQuery,
  ListServersQuery,
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
  test("[WS-TUI-ENTRY-001] interactive no-subcommand workspace starts the injected control presentation without mutation", async () => {
    let presentationStarts = 0;
    let commandCount = 0;
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async () => {
          commandCount += 1;
          return ok({});
        },
      } as unknown as CommandBus,
      queryBus: { execute: async () => ok({}) } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) =>
          createExecutionContext({ ...input, requestId: "req_workspace_tui_entry" }),
      },
      terminalIO: {
        stdin: {
          isTTY: true,
          on: () => undefined,
        },
        stdout: {
          isTTY: true,
          write: () => true,
        },
        stderr: {
          isTTY: true,
          write: () => true,
        },
      },
      environment: { TERM: "xterm-256color" },
      workspaceControlPresentation: {
        start: async () => {
          presentationStarts += 1;
        },
      },
    });

    await program.parseAsync(["node", "appaloft", "workspace"]);

    expect(presentationStarts).toBe(1);
    expect(commandCount).toBe(0);
  });

  test("[WS-TUI-FALLBACK-009] headless flags, help and existing subcommands stay renderer-free", async () => {
    let presentationStarts = 0;
    const output: string[] = [];
    const { createCliProgram } = await import("../src");
    const makeProgram = (interactive: boolean) =>
      createCliProgram({
        version: "0.1.0-test",
        startServer: async () => {},
        commandBus: { execute: async () => ok({}) } as unknown as CommandBus,
        queryBus: { execute: async () => ok({ items: [] }) } as unknown as QueryBus,
        executionContextFactory: {
          create: (input) =>
            createExecutionContext({ ...input, requestId: "req_workspace_tui_fallback" }),
        },
        terminalIO: {
          stdin: {
            isTTY: interactive,
            on: () => undefined,
          },
          stdout: {
            isTTY: interactive,
            write: (chunk) => {
              output.push(String(chunk));
              return true;
            },
          },
          stderr: {
            isTTY: interactive,
            write: () => true,
          },
        },
        workspaceControlPresentation: {
          start: async () => {
            presentationStarts += 1;
          },
        },
      });

    const processWrite = process.stdout.write;
    process.stdout.write = ((chunk) => {
      output.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      await makeProgram(false).parseAsync(["node", "appaloft", "workspace"]);
      await makeProgram(true).parseAsync(["node", "appaloft", "workspace", "--no-tui"]);
      await makeProgram(true).parseAsync(["node", "appaloft", "workspace", "--json"]);
      await makeProgram(true).parseAsync(["node", "appaloft", "workspace", "--help"]);
      await makeProgram(true).parseAsync(["node", "appaloft", "workspace", "list"]);
    } finally {
      process.stdout.write = processWrite;
    }

    expect(presentationStarts).toBe(0);
    expect(output.join("")).toContain("appaloft.workspace-occupancy/v1");
    expect(output.join("")).toContain("non-interactive-terminal");
    expect(output.join("")).toContain("no-tui");
    expect(output.join("")).toContain("structured-output");
  });

  test("[WS-REMOTE-CA-033][WS-REMOTE-CA-034][WS-REMOTE-CA-036][WS-REMOTE-CA-037][WS-REMOTE-CA-065] headless workspace --json prints current occupancies", async () => {
    const output: string[] = [];
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: { execute: async () => ok({}) } as unknown as CommandBus,
      queryBus: {
        execute: async () =>
          ok({
            items: [
              {
                id: "srv_demo",
                name: "occupancy-mac",
                sandboxId: "sbx_demo",
                status: "ready",
                occupancy: {
                  repositoryIdentity: "github.com/appaloft/appaloft",
                  commitSha: "abc123",
                  branch: "main",
                },
                activation: {
                  project: { projectId: "prj_demo" },
                },
              },
              {
                sandboxId: "sbx_failed",
                status: "failed",
              },
            ],
          }),
      } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) =>
          createExecutionContext({ ...input, requestId: "req_workspace_occupancy_tree" }),
      },
      terminalIO: {
        stdin: { isTTY: false, on: () => undefined },
        stdout: { isTTY: false, write: () => true },
        stderr: { isTTY: false, write: () => true },
      },
    });

    const processWrite = process.stdout.write;
    process.stdout.write = ((chunk) => {
      output.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      await program.parseAsync(["node", "appaloft", "workspace", "--json"]);
    } finally {
      process.stdout.write = processWrite;
    }

    const printed = output.join("");
    expect(printed).toContain("appaloft.workspace-occupancy/v1");
    expect(printed).toContain("srv_demo");
    expect(printed).toContain("occupancy-mac");
    expect(printed).toContain("sbx_demo");
    expect(printed).toContain("github.com/appaloft/appaloft");
    expect(printed).toContain("prj_demo");
    expect(printed).not.toContain("sbx_failed");
    expect(printed).not.toMatch(/sbx_failed[\s\S]{0,120}"projectId"/);
  });

  test("[WS-REMOTE-CA-066] workspace list still includes terminated and failed leftovers", async () => {
    const output: string[] = [];
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: { execute: async () => ok({}) } as unknown as CommandBus,
      queryBus: {
        execute: async () =>
          ok({
            items: [
              { sandboxId: "sbx_ready", status: "ready" },
              { sandboxId: "sbx_failed", status: "failed" },
              { sandboxId: "sbx_terminated", status: "terminated" },
            ],
          }),
      } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) =>
          createExecutionContext({ ...input, requestId: "req_workspace_list_leftovers" }),
      },
      terminalIO: {
        stdin: { isTTY: false, on: () => undefined },
        stdout: { isTTY: false, write: () => true },
        stderr: { isTTY: false, write: () => true },
      },
    });
    const processWrite = process.stdout.write;
    process.stdout.write = ((chunk) => {
      output.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      await program.parseAsync(["node", "appaloft", "workspace", "list"]);
    } finally {
      process.stdout.write = processWrite;
    }
    const printed = output.join("");
    expect(printed).toContain("sbx_ready");
    expect(printed).toContain("sbx_failed");
    expect(printed).toContain("sbx_terminated");
  });

  test("[WS-REMOTE-PREVIEW-050][WS-REMOTE-PREVIEW-051][WS-REMOTE-DEPLOY-063][WS-REMOTE-DEPLOY-064] occupancy tree copies Preview URL and last deployment", async () => {
    const output: string[] = [];
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: { execute: async () => ok({}) } as unknown as CommandBus,
      queryBus: {
        execute: async (_context, query) => {
          if (query instanceof ListServersQuery) {
            return ok({
              items: [{ id: "srv_demo", name: "occupancy-mac", lifecycleStatus: "active" }],
            });
          }
          if (query instanceof ListSandboxesQuery) {
            return ok({
              items: [
                {
                  sandboxId: "sbx_preview",
                  status: "ready",
                  occupancy: {
                    repositoryIdentity: "github.com/appaloft/examples",
                    commitSha: "1a23b77",
                    branch: "main",
                  },
                  activation: { project: { projectId: "prj_preview" } },
                },
                {
                  sandboxId: "sbx_no_preview",
                  status: "ready",
                  occupancy: {
                    repositoryIdentity: "github.com/octocat/Hello-World",
                    commitSha: "7fd1a60",
                    branch: "master",
                  },
                  activation: { project: { projectId: "prj_empty" } },
                },
              ],
            });
          }
          if (query instanceof ListResourcesQuery) {
            return ok({
              items: [
                {
                  projectId: "prj_preview",
                  slug: "app",
                  lastDeploymentId: "dep_rfqfapqwpyjn",
                  lastDeploymentStatus: "succeeded",
                  accessSummary: {
                    latestGeneratedAccessRoute: {
                      url: "http://app-jkhtnc45nk.127.0.0.1.sslip.io",
                      deploymentStatus: "succeeded",
                    },
                  },
                },
                {
                  projectId: "prj_empty",
                  slug: "app",
                  lastDeploymentStatus: "failed",
                },
              ],
            });
          }
          return ok({ items: [] });
        },
      } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) =>
          createExecutionContext({ ...input, requestId: "req_workspace_occupancy_preview" }),
      },
      terminalIO: {
        stdin: { isTTY: false, on: () => undefined },
        stdout: { isTTY: false, write: () => true },
        stderr: { isTTY: false, write: () => true },
      },
    });

    const processWrite = process.stdout.write;
    process.stdout.write = ((chunk) => {
      output.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      await program.parseAsync(["node", "appaloft", "workspace", "--json"]);
    } finally {
      process.stdout.write = processWrite;
    }

    const printed = output.join("");
    expect(printed).toContain("http://app-jkhtnc45nk.127.0.0.1.sslip.io");
    expect(printed).toContain("prj_preview");
    expect(printed).toContain("prj_empty");
    expect(printed).toContain("dep_rfqfapqwpyjn");
    expect(printed).not.toMatch(/sbx_no_preview[\s\S]{0,240}"preview"/);
    expect(printed).not.toMatch(/sbx_no_preview[\s\S]{0,240}"deployment"/);
  });

  test("[WS-TUI-FALLBACK-009][WS-TUI-TERMINAL-012] unsupported host terminals fail closed before renderer startup", async () => {
    let presentationStarts = 0;
    const output: string[] = [];
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: { execute: async () => ok({}) } as unknown as CommandBus,
      queryBus: { execute: async () => ok({ items: [] }) } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) =>
          createExecutionContext({ ...input, requestId: "req_workspace_tui_terminal_gate" }),
      },
      terminalIO: {
        stdin: { isTTY: true, on: () => undefined },
        stdout: {
          isTTY: true,
          write: (chunk) => {
            output.push(String(chunk));
            return true;
          },
        },
        stderr: { isTTY: true, write: () => true },
      },
      environment: { TERM: "dumb" },
      workspaceControlPresentation: {
        start: async () => {
          presentationStarts += 1;
        },
      },
    });

    const processWrite = process.stdout.write;
    process.stdout.write = ((chunk) => {
      output.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      await program.parseAsync(["node", "appaloft", "workspace"]);
    } finally {
      process.stdout.write = processWrite;
    }

    expect(presentationStarts).toBe(0);
    expect(output.join("")).toContain("terminal-unsupported");
  });

  test("[WS-TUI-ENTRY-001][WS-TUI-QUERY-002] remote Cloud target injects the same public Workspace presentation boundary", async () => {
    let presentationStarts = 0;
    const { createRemoteCliProgram } = await import("../src");
    const program = createRemoteCliProgram({
      version: "0.1.0-test",
      profile: {
        name: "cloud",
        mode: "public-cloud",
        baseUrl: "https://api.example.test",
        auth: { kind: "bearer", token: "not-used-by-presentation-seam" },
        createdAt: "2026-08-11T00:00:00.000Z",
        updatedAt: "2026-08-11T00:00:00.000Z",
      },
      terminalIO: {
        stdin: { isTTY: true, on: () => undefined },
        stdout: { isTTY: true, write: () => true },
        stderr: { isTTY: true, write: () => true },
      },
      environment: { TERM: "xterm-256color" },
      workspaceControlPresentation: {
        start: async (context) => {
          presentationStarts += 1;
          expect(context.terminalSessionGateway).toBeDefined();
        },
      },
    });

    await program.parseAsync(["node", "appaloft", "workspace"]);

    expect(presentationStarts).toBe(1);
  });

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

  test("[WS-CODE-CLI-001][WS-CODE-PARITY-002][WS-CODE-COMPAT-010] code native-attaches after remote door; workspace open stays Git-safe", async () => {
    const commands: OpenAgentWorkspaceCommand[] = [];
    const output: string[] = [];
    const resolvedPaths: string[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: Command<T>) => {
        expect(command).toBeInstanceOf(OpenAgentWorkspaceCommand);
        commands.push(command as OpenAgentWorkspaceCommand);
        return ok({ workspaceId: "sbx_code", resumed: true } as T);
      },
    } as unknown as CommandBus;
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus: { execute: async () => ok({}) } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) =>
          createExecutionContext({ ...input, requestId: "req_workspace_code_cli" }),
      },
      resolveRemoteCodeDoor: async () => ({
        repository: "https://github.com/Acme/Web.git",
        repositoryIdentity: "github.com/Acme/Web",
        ref: "refs/heads/feature/code",
        branch: "feature/code",
        commitSha: "0123456789abcdef0123456789abcdef01234567",
        projectId: "prj_web",
        serverId: "srv_mac",
        serverName: "mac-mini",
      }),
      resolveScratchHarness: async () => ({
        kind: "opencode",
        name: "opencode",
        argv: ["opencode"],
        skillOffered: true,
      }),
      resolveLocalWorkspaceGitContext: async (path) => {
        resolvedPaths.push(path);
        return {
          root: "/work/repository",
          remoteName: "origin",
          remote: "git@github.com:Acme/Web.git",
          repositoryIdentity: "github.com/Acme/Web",
          credentialFreeHttpsRepository: "https://github.com/Acme/Web.git",
          branch: "feature/code",
          ref: "refs/heads/feature/code",
          headSha: "0123456789abcdef0123456789abcdef01234567",
        };
      },
    });
    const write = process.stdout.write;
    process.stdout.write = ((chunk) => {
      output.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      await program.parseAsync(["node", "appaloft", "code", "--no-attach"]);
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

    expect(resolvedPaths).toEqual(["."]);
    expect(commands).toHaveLength(2);
    expect(output.join("")).toContain(
      "Remote · prj_web · github.com/Acme/Web@0123456 · mac-mini · my sandbox · sbx_code",
    );
    expect(commands[0]).toMatchObject({
      input: {
        repository: "https://github.com/Acme/Web.git",
        repositoryIdentity: "github.com/Acme/Web",
        branch: "feature/code",
        commitSha: "0123456789abcdef0123456789abcdef01234567",
        targetServerId: "srv_mac",
        attach: false,
      },
    });
    expect(commands[1]).toMatchObject({
      input: {
        repository: "https://github.com/Acme/Web.git",
        repositoryIdentity: "github.com/Acme/Web",
        branch: "feature/code",
        commitSha: "0123456789abcdef0123456789abcdef01234567",
        profile: "opencode-default",
        forceNew: true,
        attach: false,
      },
    });
  });

  test("[WS-CODE-PREFLIGHT-004][WS-CODE-ERROR-009][WS-SCRATCH-COMPAT-013] workspace open preserves Git preflight errors before dispatch", async () => {
    let commandDispatched = false;
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async () => {
          commandDispatched = true;
          return ok({});
        },
      } as unknown as CommandBus,
      queryBus: { execute: async () => ok({}) } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) =>
          createExecutionContext({ ...input, requestId: "req_workspace_code_preflight_cli" }),
      },
      resolveLocalWorkspaceGitContext: async () => {
        throw {
          code: "agent_workspace_git_worktree_dirty",
          category: "user",
          message: "Workspace source must be clean before activation",
          retryable: false,
          details: {
            phase: "workspace-git-preflight",
            recovery: "Commit or stash local changes, then push the branch",
          },
        };
      },
    });

    const originalExitCode = process.exitCode;
    const write = process.stderr.write;
    process.stderr.write = (() => true) as typeof process.stderr.write;
    try {
      await program.parseAsync(["node", "appaloft", "workspace", "open"]);
      throw new Error("Expected dirty Git preflight to fail");
    } catch (error) {
      const errorText = String(error);
      expect(errorText).toContain('"code":"agent_workspace_git_worktree_dirty"');
      expect(errorText).toContain('"phase":"workspace-git-preflight"');
      expect(errorText).toContain("Commit or stash local changes, then push the branch");
    } finally {
      process.stderr.write = write;
      process.exitCode = originalExitCode ?? 0;
    }

    expect(commandDispatched).toBeFalse();
  });

  test("[WS-SCRATCH-CLI-001][WS-SCRATCH-EMPTY-002][WS-SCRATCH-DIRTY-003][WS-SCRATCH-LOGGED-OUT-004][WS-SCRATCH-BANNER-005][WS-SCRATCH-HARNESS-006][WS-SCRATCH-NO-ATTACH-009][WS-SCRATCH-NO-STATE-012][WS-SCRATCH-PROFILE-016][WS-REMOTE-LOCAL-010][WS-REMOTE-HINT-121] --local code is scratch without Git or workspaces.open", async () => {
    const scratchDir = await mkdtemp(join(tmpdir(), "appaloft-scratch-empty-"));
    const commands: Command<unknown>[] = [];
    const launched: string[][] = [];
    const output: string[] = [];
    let gitResolved = false;
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async <T>(_context: unknown, command: Command<T>) => {
          commands.push(command as Command<unknown>);
          return ok({} as T);
        },
      } as unknown as CommandBus,
      queryBus: { execute: async () => ok({}) } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) => createExecutionContext({ ...input, requestId: "req_scratch_cli" }),
      },
      resolveLocalWorkspaceGitContext: async () => {
        gitResolved = true;
        throw new Error("scratch must not inspect Git");
      },
      resolveScratchHarness: async () => ({
        name: "opencode",
        argv: ["opencode"],
        skillOffered: true,
      }),
      launchNativeWorkspaceClient: async (argv) => {
        launched.push([...argv]);
      },
    });
    const write = process.stdout.write;
    process.stdout.write = ((chunk) => {
      output.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      await program.parseAsync(["node", "appaloft", "code", "--local", scratchDir, "--no-attach"]);
    } finally {
      process.stdout.write = write;
      await rm(scratchDir, { recursive: true, force: true });
    }

    expect(gitResolved).toBeFalse();
    expect(commands).toEqual([]);
    expect(launched).toEqual([]);
    expect(output.join("")).toContain("Local scratch · this Mac · not saved remotely");
    expect(output.join("")).toContain("opencode");
    expect(output.join("")).not.toContain("--open-target");
  });

  test("[WS-REMOTE-LOGIN-001] default code fails closed when logged out", async () => {
    const commands: Command<unknown>[] = [];
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async <T>(_context: unknown, command: Command<T>) => {
          commands.push(command as Command<unknown>);
          return ok({} as T);
        },
      } as unknown as CommandBus,
      queryBus: { execute: async () => ok({ items: [] }) } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) => createExecutionContext({ ...input, requestId: "req_remote_login" }),
      },
      resolveRemoteCodeDoor: async () => {
        throw {
          code: "workspace_remote_login_required",
          category: "conflict",
          message: "Sign in before opening a remote Agent session",
          retryable: false,
          details: { phase: "remote-code-login" },
        };
      },
    });
    const originalExitCode = process.exitCode;
    const write = process.stderr.write;
    process.stderr.write = (() => true) as typeof process.stderr.write;
    try {
      await program.parseAsync(["node", "appaloft", "code", "--no-attach"]);
      throw new Error("Expected login-required remote code to fail");
    } catch (error) {
      expect(String(error)).toContain('"code":"workspace_remote_login_required"');
    } finally {
      process.stderr.write = write;
      process.exitCode = originalExitCode ?? 0;
    }
    expect(commands).toEqual([]);
  });

  test("[WS-REMOTE-PROFILE-008][WS-REMOTE-NO-ATTACH-016] missing Profile still occupies via workspaces.open", async () => {
    const commands: Command<unknown>[] = [];
    const output: string[] = [];
    const { createCliProgram } = await import("../src");
    const { OpenAgentWorkspaceCommand } = await import("@appaloft/application");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async <T>(_context: unknown, command: Command<T>) => {
          commands.push(command as Command<unknown>);
          return ok({ workspaceId: "sbx_web", projectId: "prj_web" } as T);
        },
      } as unknown as CommandBus,
      queryBus: { execute: async () => ok({ items: [] }) } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) => createExecutionContext({ ...input, requestId: "req_remote_profile" }),
      },
      resolveRemoteCodeDoor: async () => ({
        repository: "https://github.com/acme/api.git",
        repositoryIdentity: "github.com/acme/api",
        ref: "refs/heads/main",
        branch: "main",
        commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        projectId: "prj_web",
        serverId: "srv_1",
        serverName: "mac-mini",
      }),
    });
    const write = process.stdout.write;
    process.stdout.write = ((chunk) => {
      output.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      await program.parseAsync(["node", "appaloft", "code", "--no-attach"]);
    } finally {
      process.stdout.write = write;
    }
    expect(commands.some((command) => command instanceof OpenAgentWorkspaceCommand)).toBeTrue();
    expect((commands[0] as OpenAgentWorkspaceCommand).input).toMatchObject({
      targetServerId: "srv_1",
      attach: false,
    });
    expect(output.join("")).toContain(
      "Remote · prj_web · github.com/acme/api@aaaaaaa · mac-mini · my sandbox · sbx_web",
    );
    expect(output.join("")).not.toContain("opencode · Appaloft skill offered");
  });

  test("[WS-REMOTE-OPEN-003][WS-REMOTE-NO-UPLOAD-006][WS-REMOTE-BANNER-014] default code occupies without local Git fail-closed", async () => {
    const commands: Command<unknown>[] = [];
    const output: string[] = [];
    let localGitResolved = false;
    const { createCliProgram } = await import("../src");
    const { OpenAgentWorkspaceCommand } = await import("@appaloft/application");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async <T>(_context: unknown, command: Command<T>) => {
          commands.push(command as Command<unknown>);
          return ok({ workspaceId: "sbx_billing", projectId: "prj_billing" } as T);
        },
      } as unknown as CommandBus,
      queryBus: { execute: async () => ok({ items: [] }) } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) => createExecutionContext({ ...input, requestId: "req_remote_open" }),
      },
      resolveLocalWorkspaceGitContext: async () => {
        localGitResolved = true;
        throw new Error("remote code must not use dirty-tree Git preflight");
      },
      resolveRemoteCodeDoor: async () => ({
        repository: "https://github.com/acme/api.git",
        repositoryIdentity: "github.com/acme/api",
        ref: "refs/heads/main",
        branch: "main",
        commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        projectId: "prj_billing",
        serverId: "srv_1",
        serverName: "mac-mini",
      }),
    });
    const write = process.stdout.write;
    process.stdout.write = ((chunk) => {
      output.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      await program.parseAsync(["node", "appaloft", "code", "--no-attach"]);
    } finally {
      process.stdout.write = write;
    }

    expect(localGitResolved).toBeFalse();
    expect(commands.some((command) => command instanceof OpenAgentWorkspaceCommand)).toBeTrue();
    expect(output.join("")).toContain(
      "Remote · prj_billing · github.com/acme/api@aaaaaaa · mac-mini · my sandbox · sbx_billing",
    );
    expect(output.join("")).toContain(
      "Connect a model in the attached OpenCode session before running a Task.",
    );
    expect(output.join("")).not.toContain("Local scratch · this Mac · not saved remotely");
  });

  test("[WS-REMOTE-BANNER-061][WS-REMOTE-HINT-119][WS-REMOTE-HINT-120] code banner includes occupancy Preview URL", async () => {
    const output: string[] = [];
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async <T>() =>
          ok({ workspaceId: "sbx_whoami", projectId: "prj_tk5lovqu2vj8" } as T),
      } as unknown as CommandBus,
      queryBus: {
        execute: async <T>() =>
          ok({
            items: [
              {
                projectId: "prj_tk5lovqu2vj8",
                slug: "app",
                lastDeploymentStatus: "succeeded",
                accessSummary: {
                  latestGeneratedAccessRoute: {
                    url: "http://app-sc156jw98k.127.0.0.1.sslip.io",
                    deploymentStatus: "succeeded",
                  },
                },
              },
            ],
          } as T),
      } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) => createExecutionContext({ ...input, requestId: "req_banner_preview" }),
      },
      resolveRemoteCodeDoor: async () => ({
        repository: "https://github.com/traefik/whoami.git",
        repositoryIdentity: "github.com/traefik/whoami",
        ref: "refs/heads/master",
        branch: "master",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
        projectId: "prj_tk5lovqu2vj8",
        serverId: "srv_uil9cpctplou",
        serverName: "occupancy-mac",
      }),
    });
    const write = process.stdout.write;
    process.stdout.write = ((chunk) => {
      output.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      await program.parseAsync(["node", "appaloft", "code", "--no-attach"]);
    } finally {
      process.stdout.write = write;
    }
    expect(output.join("")).toContain(
      "Remote · prj_tk5lovqu2vj8 · github.com/traefik/whoami@1ce75d0 · occupancy-mac · my sandbox · sbx_whoami\nPreview · http://app-sc156jw98k.127.0.0.1.sslip.io",
    );
    expect(output.join("")).toContain(
      "Open · --open-target preview|compare · workspace p/c\nConnect a model in the attached OpenCode session before running a Task.",
    );
  });

  test("[WS-REMOTE-OPEN-107][WS-REMOTE-OPEN-109] code --open prints Preview and stays lean in CI", async () => {
    const output: string[] = [];
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async <T>() =>
          ok({ workspaceId: "sbx_whoami", projectId: "prj_tk5lovqu2vj8" } as T),
      } as unknown as CommandBus,
      queryBus: {
        execute: async <T>() =>
          ok({
            items: [
              {
                projectId: "prj_tk5lovqu2vj8",
                slug: "app",
                lastDeploymentStatus: "succeeded",
                accessSummary: {
                  latestGeneratedAccessRoute: {
                    url: "http://app-sc156jw98k.127.0.0.1.sslip.io",
                    deploymentStatus: "succeeded",
                  },
                },
              },
            ],
          } as T),
      } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) => createExecutionContext({ ...input, requestId: "req_code_open" }),
      },
      resolveRemoteCodeDoor: async () => ({
        repository: "https://github.com/traefik/whoami.git",
        repositoryIdentity: "github.com/traefik/whoami",
        ref: "refs/heads/master",
        branch: "master",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
        projectId: "prj_tk5lovqu2vj8",
        serverId: "srv_uil9cpctplou",
        serverName: "occupancy-mac",
      }),
    });
    const write = process.stdout.write;
    const previousCi = process.env.CI;
    process.env.CI = "true";
    process.stdout.write = ((chunk) => {
      output.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      await program.parseAsync(["node", "appaloft", "code", "--no-attach", "--open"]);
    } finally {
      process.stdout.write = write;
      if (previousCi === undefined) delete process.env.CI;
      else process.env.CI = previousCi;
    }
    expect(output.join("")).toContain("Open · http://app-sc156jw98k.127.0.0.1.sslip.io");
  });

  test("[R8-OCC-CODE-007] code --new isolates a new occupancy Workspace", async () => {
    const commands: Command<unknown>[] = [];
    const { createCliProgram } = await import("../src");
    const { OpenAgentWorkspaceCommand } = await import("@appaloft/application");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async <T>(_context: unknown, command: Command<T>) => {
          commands.push(command as Command<unknown>);
          return ok({ workspaceId: "sbx_new", projectId: "prj_billing" } as T);
        },
      } as unknown as CommandBus,
      queryBus: { execute: async () => ok({ items: [] }) } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) => createExecutionContext({ ...input, requestId: "req_code_new" }),
      },
      resolveRemoteCodeDoor: async () => ({
        repository: "https://github.com/acme/api.git",
        repositoryIdentity: "github.com/acme/api",
        ref: "refs/heads/main",
        branch: "main",
        commitSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        projectId: "prj_billing",
        serverId: "srv_1",
        serverName: "mac-mini",
      }),
    });

    await program.parseAsync(["node", "appaloft", "code", "--new", "--no-attach"]);

    expect((commands[0] as OpenAgentWorkspaceCommand).input).toMatchObject({
      forceNew: true,
      attach: false,
      targetServerId: "srv_1",
    });
  });

  test("[R8-OCC-CODE-008] code resumes the pinned occupancy Workspace when requested SHA moved", async () => {
    const commands: Command<unknown>[] = [];
    const output: string[] = [];
    const { createCliProgram } = await import("../src");
    const { OpenAgentWorkspaceCommand } = await import("@appaloft/application");
    const { domainError } = await import("@appaloft/core");
    let attempts = 0;
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async <T>(_context: unknown, command: Command<T>) => {
          commands.push(command as Command<unknown>);
          attempts += 1;
          if (attempts === 1) {
            return err(
              domainError.conflict("Preferred Workspace is pinned to another Git commit", {
                code: "workspace_open_source_pin_mismatch",
                workspaceId: "sbx_h1swq765kcgw",
                requestedCommitSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                workspaceCommitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              }),
            );
          }
          return ok({
            workspaceId: "sbx_h1swq765kcgw",
            projectId: "prj_billing",
            source: { commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
          } as T);
        },
      } as unknown as CommandBus,
      queryBus: { execute: async () => ok({ items: [] }) } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) => createExecutionContext({ ...input, requestId: "req_code_resume" }),
      },
      resolveRemoteCodeDoor: async () => ({
        repository: "https://github.com/acme/api.git",
        repositoryIdentity: "github.com/acme/api",
        ref: "refs/heads/main",
        branch: "main",
        commitSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        projectId: "prj_billing",
        serverId: "srv_1",
        serverName: "mac-mini",
      }),
    });
    const write = process.stdout.write;
    process.stdout.write = ((chunk) => {
      output.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      await program.parseAsync(["node", "appaloft", "code", "--no-attach"]);
    } finally {
      process.stdout.write = write;
    }

    expect(commands).toHaveLength(2);
    expect((commands[0] as OpenAgentWorkspaceCommand).input.commitSha).toBe(
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    );
    expect((commands[1] as OpenAgentWorkspaceCommand).input).toMatchObject({
      commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      forceNew: false,
    });
    expect(output.join("")).toContain(
      "Pinned · sbx_h1swq765kcgw @ aaaaaaa · requested bbbbbbb · use --new for an isolated Workspace",
    );
    expect(output.join("")).toContain(
      "Remote · prj_billing · github.com/acme/api@aaaaaaa · mac-mini · my sandbox · sbx_h1swq765kcgw",
    );
    expect(output.join("")).toContain(
      "Connect a model in the attached OpenCode session before running a Task.",
    );
  });

  test("[R8-OCC-CODE-009] code attach after pin mismatch launches the native OpenCode client", async () => {
    const commands: Command<unknown>[] = [];
    const launched: string[][] = [];
    const { createCliProgram } = await import("../src");
    const { OpenAgentWorkspaceCommand } = await import("@appaloft/application");
    const { domainError } = await import("@appaloft/core");
    let attempts = 0;
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async <T>(_context: unknown, command: Command<T>) => {
          commands.push(command as Command<unknown>);
          attempts += 1;
          if (attempts === 1) {
            return err(
              domainError.conflict("Preferred Workspace is pinned to another Git commit", {
                code: "workspace_open_source_pin_mismatch",
                workspaceId: "sbx_h1swq765kcgw",
                requestedCommitSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                workspaceCommitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              }),
            );
          }
          return ok({
            workspaceId: "sbx_h1swq765kcgw",
            projectId: "prj_billing",
            attach: {
              transport: "native-attach",
              clientHandoff: "local-client-exec",
              clientCommand: [
                "opencode",
                "attach",
                "https://attach.example.test/capability",
                "--dir",
                "/workspace",
              ],
            },
          } as T);
        },
      } as unknown as CommandBus,
      queryBus: { execute: async () => ok({ items: [] }) } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) =>
          createExecutionContext({ ...input, requestId: "req_code_resume_attach" }),
      },
      resolveRemoteCodeDoor: async () => ({
        repository: "https://github.com/acme/api.git",
        repositoryIdentity: "github.com/acme/api",
        ref: "refs/heads/main",
        branch: "main",
        commitSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        projectId: "prj_billing",
        serverId: "srv_1",
        serverName: "mac-mini",
      }),
      launchNativeWorkspaceClient: async (argv) => {
        launched.push([...argv]);
      },
    });

    await program.parseAsync(["node", "appaloft", "code"]);

    expect((commands[1] as OpenAgentWorkspaceCommand).input).toMatchObject({
      commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      attach: true,
      forceNew: false,
    });
    expect(launched).toEqual([
      ["opencode", "attach", "https://attach.example.test/capability", "--dir", "/workspace"],
    ]);
  });

  test("[WS-REMOTE-TARGET-015] local-shell Server occupies with targetServerId", async () => {
    const commands: Command<unknown>[] = [];
    const output: string[] = [];
    const launched: string[][] = [];
    const { createCliProgram } = await import("../src");
    const { OpenAgentWorkspaceCommand } = await import("@appaloft/application");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async <T>(_context: unknown, command: Command<T>) => {
          commands.push(command as Command<unknown>);
          return ok({
            workspaceId: "sbx_local",
            projectId: "prj_billing",
            attach: {
              transport: "native-attach",
              clientHandoff: "local-client-exec",
              clientCommand: ["opencode", "attach"],
            },
          } as T);
        },
      } as unknown as CommandBus,
      queryBus: { execute: async () => ok({ items: [] }) } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) => createExecutionContext({ ...input, requestId: "req_local_shell" }),
      },
      resolveRemoteCodeDoor: async () => ({
        repository: "https://github.com/acme/api.git",
        repositoryIdentity: "github.com/acme/api",
        ref: "refs/heads/main",
        branch: "main",
        commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        projectId: "prj_billing",
        serverId: "srv_local",
        serverName: "this-mac",
        serverProviderKey: "local-shell",
      }),
      launchNativeWorkspaceClient: async (argv) => {
        launched.push([...argv]);
      },
    });
    const write = process.stdout.write;
    process.stdout.write = ((chunk) => {
      output.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      await program.parseAsync(["node", "appaloft", "code"]);
    } finally {
      process.stdout.write = write;
    }

    expect(commands.some((command) => command instanceof OpenAgentWorkspaceCommand)).toBeTrue();
    expect((commands[0] as OpenAgentWorkspaceCommand).input.targetServerId).toBe("srv_local");
    expect(launched).toEqual([["opencode", "attach"]]);
    expect(output.join("")).toContain(
      "Remote · prj_billing · github.com/acme/api@aaaaaaa · this-mac · my sandbox · sbx_local",
    );
  });

  test("[WS-REMOTE-COMPAT-128][WS-REMOTE-COMPAT-129][WS-REMOTE-COMPAT-130] unstructured occupancy validation names the enrolled Server", async () => {
    const commands: Command<unknown>[] = [];
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async <T>(_context: unknown, command: Command<T>) => {
          commands.push(command as Command<unknown>);
          return err({
            code: "bad_request",
            category: "user",
            message: "Input validation failed",
            retryable: false,
            details: { phase: "orpc-error-normalization", orpcCode: "BAD_REQUEST" },
          });
        },
      } as unknown as CommandBus,
      queryBus: { execute: async () => ok({ items: [] }) } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) => createExecutionContext({ ...input, requestId: "req_cloud_compat" }),
      },
      resolveRemoteCodeDoor: async () => ({
        repository: "https://github.com/acme/api.git",
        repositoryIdentity: "github.com/acme/api",
        ref: "refs/heads/main",
        branch: "main",
        commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        projectId: "prj_web",
        serverId: "srv_4lifk0yrcecy",
        serverName: "hostinger",
      }),
    });
    const originalExitCode = process.exitCode;
    const write = process.stderr.write;
    process.stderr.write = (() => true) as typeof process.stderr.write;
    try {
      await program.parseAsync(["node", "appaloft", "code", "--no-attach"]);
      throw new Error("Expected occupancy Cloud-compat validation to fail");
    } catch (error) {
      expect(String(error)).toContain('"code":"workspace_open_target_server_unsupported"');
      expect(String(error)).toContain("hostinger (srv_4lifk0yrcecy)");
    } finally {
      process.stderr.write = write;
      process.exitCode = originalExitCode ?? 0;
    }
    expect(commands).toHaveLength(1);
    expect((commands[0] as OpenAgentWorkspaceCommand).input.targetServerId).toBe(
      "srv_4lifk0yrcecy",
    );
  });

  test("[WS-SCRATCH-INSTALL-007] refused install is the only hard scratch failure", async () => {
    let commandDispatched = false;
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async () => {
          commandDispatched = true;
          return ok({});
        },
      } as unknown as CommandBus,
      queryBus: { execute: async () => ok({}) } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) =>
          createExecutionContext({ ...input, requestId: "req_scratch_install_refused" }),
      },
      resolveScratchHarness: async () => {
        throw {
          code: "workspace_scratch_install_refused",
          category: "validation",
          message: "Install a supported local Agent to continue",
          retryable: false,
          details: { phase: "scratch-harness" },
        };
      },
    });
    const originalExitCode = process.exitCode;
    const write = process.stderr.write;
    process.stderr.write = (() => true) as typeof process.stderr.write;
    try {
      await program.parseAsync(["node", "appaloft", "code", "--local", "--no-attach"]);
      throw new Error("Expected refused install to fail");
    } catch (error) {
      const errorText = String(error);
      expect(errorText).toContain('"code":"workspace_scratch_install_refused"');
      expect(errorText).toContain('"phase":"scratch-harness"');
    } finally {
      process.stderr.write = write;
      process.exitCode = originalExitCode ?? 0;
    }
    expect(commandDispatched).toBeFalse();
  });

  test("[WS-REMOTE-URL-LOCAL-027] --local plus git remote fail closed", async () => {
    let commandDispatched = false;
    let scratchResolved = false;
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async () => {
          commandDispatched = true;
          return ok({});
        },
      } as unknown as CommandBus,
      queryBus: { execute: async () => ok({}) } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) =>
          createExecutionContext({ ...input, requestId: "req_scratch_remote_rejected" }),
      },
      resolveScratchHarness: async () => {
        scratchResolved = true;
        return { name: "opencode", argv: ["opencode"], skillOffered: true };
      },
    });
    const originalExitCode = process.exitCode;
    const write = process.stderr.write;
    process.stderr.write = (() => true) as typeof process.stderr.write;
    try {
      await program.parseAsync([
        "node",
        "appaloft",
        "code",
        "--local",
        "https://github.com/org/repo.git",
        "--no-attach",
      ]);
      throw new Error("Expected --local plus remote to fail");
    } catch (error) {
      const errorText = String(error);
      expect(errorText).toContain('"code":"workspace_scratch_remote_rejected"');
    } finally {
      process.stderr.write = write;
      process.exitCode = originalExitCode ?? 0;
    }
    expect(commandDispatched).toBeFalse();
    expect(scratchResolved).toBeFalse();
  });

  test("[WS-SCRATCH-ATTACH-008][WS-SCRATCH-SKILL-010] scratch attaches the local harness in the selected directory", async () => {
    const scratchDir = await mkdtemp(join(tmpdir(), "appaloft-scratch-attach-"));
    const launched: Array<{ argv: string[]; cwd: string; env?: Record<string, string> }> = [];
    const commands: Command<unknown>[] = [];
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async <T>(_context: unknown, command: Command<T>) => {
          commands.push(command as Command<unknown>);
          return ok({} as T);
        },
      } as unknown as CommandBus,
      queryBus: { execute: async () => ok({}) } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) => createExecutionContext({ ...input, requestId: "req_scratch_attach" }),
      },
      resolveScratchHarness: async () => ({
        name: "pi",
        argv: ["pi", "--skill", "/tmp/skills/appaloft"],
        skillOffered: true,
        skillPath: "/tmp/skills/appaloft",
      }),
      launchScratchAgent: async (input) => {
        launched.push({
          argv: [...input.argv],
          cwd: input.cwd,
          ...(input.env ? { env: { ...input.env } } : {}),
        });
      },
    });

    try {
      await program.parseAsync(["node", "appaloft", "code", "--local", scratchDir]);
    } finally {
      await rm(scratchDir, { recursive: true, force: true });
    }

    expect(commands).toEqual([]);
    expect(launched).toEqual([
      {
        argv: ["pi", "--skill", "/tmp/skills/appaloft"],
        cwd: scratchDir,
      },
    ]);
  });

  test("[WS-CODE-ATTACH-006][WS-ATTACH-MANAGED-014] automatically connects a managed-terminal attach descriptor", async () => {
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
      resolveRemoteCodeDoor: async () => ({
        repository: "https://github.com/Acme/Web.git",
        repositoryIdentity: "github.com/Acme/Web",
        ref: "refs/heads/main",
        branch: "main",
        commitSha: "0123456789abcdef0123456789abcdef01234567",
        projectId: "prj_web",
        serverId: "srv_mac",
        serverName: "mac-mini",
      }),
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

    await program.parseAsync(["node", "appaloft", "workspace", "open", ".", "--new"]);
    expect(attached).toEqual(["term_pi"]);
    expect(output.join("")).toContain("Pi ready\n");
  });

  test("[WS-CODE-ATTACH-006][WS-ATTACH-NATIVE-015] executes the Adapter-declared native client handoff without a shell", async () => {
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
      resolveRemoteCodeDoor: async () => ({
        repository: "https://github.com/Acme/Web.git",
        repositoryIdentity: "github.com/Acme/Web",
        ref: "refs/heads/main",
        branch: "main",
        commitSha: "0123456789abcdef0123456789abcdef01234567",
        projectId: "prj_web",
        serverId: "srv_mac",
        serverName: "mac-mini",
      }),
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

    await program.parseAsync(["node", "appaloft", "workspace", "open", ".", "--new"]);

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

  test("[R8-OCC-ATTACH-006] workspace attach launches the native OpenCode client", async () => {
    const launched: string[][] = [];
    const { createCliProgram } = await import("../src");
    const { IssueSandboxAgentAttachAccessCommand } = await import("@appaloft/application");
    const commands: Command<unknown>[] = [];
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async <T>(_context: unknown, command: Command<T>) => {
          commands.push(command as Command<unknown>);
          return ok({
            workspaceId: "sbx_occupancy",
            runtimeId: "sar_occupancy",
            transport: "native-attach",
            access: {
              exposureId: "sexp_occupancy",
              port: 4096,
              visibility: "private",
              url: "https://attach.example.test/capability",
              expiresAt: "2026-08-15T13:00:00.000Z",
            },
            clientCommand: [
              "opencode",
              "attach",
              "https://attach.example.test/capability",
              "--dir",
              "/workspace",
            ],
            clientHandoff: "local-client-exec",
          } as T);
        },
      } as unknown as CommandBus,
      queryBus: {
        execute: async () =>
          ok({
            items: [
              {
                runtimeId: "sar_occupancy",
                interaction: { transport: "native-attach", serverPort: 4096 },
              },
            ],
          }),
      } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) =>
          createExecutionContext({ ...input, requestId: "req_workspace_attach_launch" }),
      },
      launchNativeWorkspaceClient: async (argv) => {
        launched.push([...argv]);
      },
    });

    await program.parseAsync(["node", "appaloft", "workspace", "attach", "sbx_occupancy"]);

    expect(commands[0]).toBeInstanceOf(IssueSandboxAgentAttachAccessCommand);
    expect(launched).toEqual([
      ["opencode", "attach", "https://attach.example.test/capability", "--dir", "/workspace"],
    ]);
  });
});
