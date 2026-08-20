import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  AcquireWorkspaceWriterLeaseCommand,
  AddWorkspaceCollaborationLaneCommand,
  AddWorkspaceCollaborationParticipantCommand,
  AgentWorkspaceOpenCommandHandler,
  AgentWorkspaceOpenService,
  ApproveAgentTaskRunCommand,
  CancelAgentTaskRunCommand,
  type Command,
  type CommandBus,
  CreateAgentTaskRunCommand,
  CreateProjectCommand,
  CreateWorkspaceCollaborationCommand,
  createExecutionContext,
  DeliverAgentTaskRunCommand,
  ExecuteSandboxCommand,
  type ExecutionContextFactory,
  ExposeSandboxPortCommand,
  IssueWorkspaceCollaborationNativeAttachCommand,
  IssueWorkspaceCollaborationTerminalAccessCommand,
  ListAgentTaskRunsQuery,
  ListProjectsQuery,
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
  ShowProjectQuery,
  ShowSandboxQuery,
  ShowWorkspaceCollaborationQuery,
  SteerAgentTaskRunCommand,
  StopAgentTaskRunCommand,
  type TerminalSession,
  type TerminalSessionAttachmentGateway,
  type TerminalSessionFrame,
  TerminateSandboxAgentRuntimeCommand,
  TerminateSandboxCommand,
} from "@appaloft/application";
import { domainError, err, ok } from "@appaloft/core";
import { Effect } from "effect";

import { folderDirectoryName, folderOccupancyIdentity } from "../src/folder-project-link.js";
import { OCCUPANCY_CODE_CHROME_TITLE } from "../src/occupancy-code-progress.js";
import {
  createBoundedWorkspaceControlPresentation,
  type WorkspaceControlPresentationContext,
} from "../src/workspace-control-presentation.js";

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
        environment: { APPALOFT_TOKEN: "tok_logged_in_workspace" },
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
    expect(output.join("")).not.toContain("login-required");
  });

  test("[WS-OPEN-LOCATOR-023] code and workspace open help name path|git-remote", async () => {
    const output: string[] = [];
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: { execute: async () => ok({}) } as unknown as CommandBus,
      queryBus: { execute: async () => ok({ items: [] }) } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) => createExecutionContext({ ...input, requestId: "req_locator_help" }),
      },
    });
    const writeStdout = process.stdout.write;
    const writeLog = console.log;
    process.stdout.write = ((chunk) => {
      output.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    console.log = (...args: unknown[]) => {
      output.push(args.map(String).join(" "));
    };
    try {
      await program.parseAsync(["node", "appaloft", "workspace", "open", "--help"]);
      await program.parseAsync(["node", "appaloft", "code", "--help"]);
    } finally {
      process.stdout.write = writeStdout;
      console.log = writeLog;
    }
    const printed = output.join("");
    expect(printed).toContain("path|git-remote");
    expect(printed).toContain("Local path or git remote");
    expect(printed).toContain("$ open");
    expect(printed).toContain("appaloft code [path|git-remote] [options]");
    expect(printed).toContain("--no-attach");
    expect(printed).not.toContain("$ code");
  });

  test("[WS-REMOTE-CA-033] headless workspace --no-tui prints occupancy tree when login is missing", async () => {
    const output: string[] = [];
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: { execute: async () => ok({}) } as unknown as CommandBus,
      queryBus: {
        execute: async () =>
          err({
            code: "product_auth_missing",
            category: "user",
            message: "Product operation requires a valid session",
            retryable: false,
          }),
      } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) =>
          createExecutionContext({ ...input, requestId: "req_workspace_login_required" }),
      },
      terminalIO: {
        stdin: { isTTY: false, on: () => undefined },
        stdout: { isTTY: false, write: () => true },
        stderr: { isTTY: false, write: () => true },
      },
      environment: { APPALOFT_TOKEN: "tok_logged_in_workspace" },
    });

    const processWrite = process.stdout.write;
    process.stdout.write = ((chunk) => {
      output.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      await program.parseAsync(["node", "appaloft", "workspace", "--no-tui"]);
    } finally {
      process.stdout.write = processWrite;
    }

    const printed = output.join("");
    expect(printed).toContain("appaloft.workspace-occupancy/v1");
    expect(printed).toContain("login-required");
    expect(printed).toContain("Run appaloft login");
    expect(printed).not.toContain("Product operation requires a valid session");
    expect(printed).not.toContain('"status": "ready"');
  });

  test("[WS-REMOTE-CA-033] unauthenticated no-profile empty local backend workspace --json is login-required", async () => {
    const output: string[] = [];
    let queryCount = 0;
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: { execute: async () => ok({}) } as unknown as CommandBus,
      queryBus: {
        execute: async () => {
          queryCount += 1;
          return ok({ items: [] });
        },
      } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) =>
          createExecutionContext({ ...input, requestId: "req_workspace_unauthenticated_json" }),
      },
      terminalIO: {
        stdin: { isTTY: false, on: () => undefined },
        stdout: { isTTY: false, write: () => true },
        stderr: { isTTY: false, write: () => true },
      },
      environment: { APPALOFT_HOME: join(tmpdir(), "appaloft-unauthenticated-workspace") },
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
    expect(queryCount).toBe(0);
    expect(printed).toContain("login-required");
    expect(printed).toContain("Run appaloft login");
    expect(printed).not.toContain('"status": "ready"');
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
      environment: { APPALOFT_TOKEN: "tok_logged_in_workspace" },
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
      environment: { APPALOFT_TOKEN: "tok_logged_in_workspace" },
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
    expect((commands[0] as OpenAgentWorkspaceCommand).input.targetServerId).toBeUndefined();
  });

  test("[WS-REMOTE-OPEN-BYOS-181] workspace open --server pins the registered BYOS Server", async () => {
    const commands: Command<unknown>[] = [];
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async <T>(_context: unknown, command: Command<T>) => {
          commands.push(command as Command<unknown>);
          return ok({ workspaceId: "sbx_byos", resumed: false } as T);
        },
      } as unknown as CommandBus,
      queryBus: {
        execute: async () =>
          ok({
            items: [
              {
                id: "srv_yundu",
                name: "yundu",
                lifecycleStatus: "active",
              },
            ],
          }),
      } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) => createExecutionContext({ ...input, requestId: "req_open_server" }),
      },
      resolveLocalWorkspaceGitContext: async () => ({
        root: "/work/whoami",
        remoteName: "origin",
        remote: "git@github.com:traefik/whoami.git",
        repositoryIdentity: "github.com/traefik/whoami",
        credentialFreeHttpsRepository: "https://github.com/traefik/whoami.git",
        branch: "main",
        ref: "refs/heads/main",
        headSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
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
        "appaloft-remote",
        "--new",
        "--no-attach",
        "--server",
        "srv_4lifk0yrcecy",
      ]);
    } finally {
      process.stdout.write = write;
    }
    expect((commands[0] as OpenAgentWorkspaceCommand).input).toMatchObject({
      targetServerId: "srv_4lifk0yrcecy",
      forceNew: true,
      repositoryIdentity: "github.com/traefik/whoami",
    });
  });

  test("[WS-REMOTE-OPEN-BYOS-181] workspace open defaults to the enrolled BYOS Server", async () => {
    const commands: Command<unknown>[] = [];
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async <T>(_context: unknown, command: Command<T>) => {
          commands.push(command as Command<unknown>);
          return ok({ workspaceId: "sbx_byos_default", resumed: false } as T);
        },
      } as unknown as CommandBus,
      queryBus: {
        execute: async () =>
          ok({
            items: [
              {
                id: "srv_4lifk0yrcecy",
                name: "hostinger",
                lifecycleStatus: "active",
                runtimeAvailability: { status: "available" },
              },
            ],
          }),
      } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) => createExecutionContext({ ...input, requestId: "req_open_byos" }),
      },
      resolveLocalWorkspaceGitContext: async () => ({
        root: "/work/whoami",
        remoteName: "origin",
        remote: "git@github.com:traefik/whoami.git",
        repositoryIdentity: "github.com/traefik/whoami",
        credentialFreeHttpsRepository: "https://github.com/traefik/whoami.git",
        branch: "main",
        ref: "refs/heads/main",
        headSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
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
        "--new",
        "--no-attach",
      ]);
    } finally {
      process.stdout.write = write;
    }
    expect((commands[0] as OpenAgentWorkspaceCommand).input.targetServerId).toBe(
      "srv_4lifk0yrcecy",
    );
  });

  test("[WS-REMOTE-OPEN-BYOS-181] code --server pins hostinger when the injected door is another Server", async () => {
    const commands: Command<unknown>[] = [];
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async <T>(_context: unknown, command: Command<T>) => {
          commands.push(command as Command<unknown>);
          return ok({ workspaceId: "sbx_code_server", projectId: "prj_billing" } as T);
        },
      } as unknown as CommandBus,
      queryBus: { execute: async () => ok({ items: [] }) } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) => createExecutionContext({ ...input, requestId: "req_code_server" }),
      },
      resolveRemoteCodeDoor: async () => ({
        repository: "https://github.com/acme/api.git",
        repositoryIdentity: "github.com/acme/api",
        ref: "refs/heads/main",
        branch: "main",
        commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        projectId: "prj_billing",
        serverId: "srv_yundu",
        serverName: "yundu",
      }),
    });
    const write = process.stdout.write;
    process.stdout.write = (() => true) as typeof process.stdout.write;
    try {
      await program.parseAsync([
        "node",
        "appaloft",
        "code",
        "--no-attach",
        "--server",
        "srv_4lifk0yrcecy",
      ]);
    } finally {
      process.stdout.write = write;
    }
    expect((commands[0] as OpenAgentWorkspaceCommand).input).toMatchObject({
      targetServerId: "srv_4lifk0yrcecy",
      attach: false,
    });
  });

  test("[WS-OPEN-LOCATOR-023] workspace open accepts a git-remote like code", async () => {
    const commands: OpenAgentWorkspaceCommand[] = [];
    const localGitCalls: string[] = [];
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async <T>(_context: unknown, command: Command<T>) => {
          expect(command).toBeInstanceOf(OpenAgentWorkspaceCommand);
          commands.push(command as OpenAgentWorkspaceCommand);
          return ok({ workspaceId: "sbx_remote", resumed: false } as T);
        },
      } as unknown as CommandBus,
      queryBus: { execute: async () => ok({ items: [] }) } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) =>
          createExecutionContext({ ...input, requestId: "req_workspace_open_remote" }),
      },
      resolveLocalWorkspaceGitContext: async (path) => {
        localGitCalls.push(path);
        throw new Error("git-remote must not use local worktree inspection");
      },
      resolveWorkspaceOpenSource: async (path) => {
        expect(path).toBe("https://github.com/org/repo.git");
        return {
          repositoryIdentity: "github.com/org/repo",
          credentialFreeHttpsRepository: "https://github.com/org/repo.git",
          branch: "main",
          ref: "refs/heads/main",
          headSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        };
      },
    });
    const write = process.stdout.write;
    process.stdout.write = (() => true) as typeof process.stdout.write;
    try {
      await program.parseAsync([
        "node",
        "appaloft",
        "workspace",
        "open",
        "https://github.com/org/repo.git",
        "--profile",
        "opencode-default",
        "--new",
        "--no-attach",
      ]);
    } finally {
      process.stdout.write = write;
    }
    expect(localGitCalls).toEqual([]);
    expect(commands).toHaveLength(1);
    expect(commands[0]?.input).toMatchObject({
      repository: "https://github.com/org/repo.git",
      repositoryIdentity: "github.com/org/repo",
      branch: "main",
      commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      profile: "opencode-default",
      forceNew: true,
      attach: false,
    });
  });

  test("[WS-OPEN-LOCATOR-024] workspace open does not occupy an unrelated occupancy from a non-git directory", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "appaloft-workspace-open-cli-nongit-"));
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
      queryBus: {
        execute: async () =>
          ok({
            items: [
              {
                sandboxId: "sbx_examples",
                status: "ready",
                occupancy: {
                  repositoryIdentity: "github.com/appaloft/examples",
                  commitSha: "b".repeat(40),
                  branch: "main",
                },
              },
            ],
          }),
      } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) =>
          createExecutionContext({ ...input, requestId: "req_workspace_open_nongit" }),
      },
      resolveLocalWorkspaceGitContext: async () => {
        throw {
          code: "validation_error",
          category: "user",
          message: "Workspace path is not inside a Git worktree",
          retryable: false,
          details: { code: "workspace_git_root_unavailable" },
        };
      },
    });
    const originalExitCode = process.exitCode;
    const write = process.stderr.write;
    process.stderr.write = (() => true) as typeof process.stderr.write;
    try {
      await program.parseAsync([
        "node",
        "appaloft",
        "workspace",
        "open",
        emptyDir,
        "--profile",
        "opencode-default",
        "--new",
        "--no-attach",
      ]);
      throw new Error("Expected non-git directory without this-folder locator to fail");
    } catch (error) {
      const errorText = String(error);
      expect(errorText).toContain("workspace_remote_repository_missing");
      expect(errorText).not.toContain("Workspace path is not inside a Git worktree");
      expect(errorText).not.toContain("github.com/appaloft/examples");
    } finally {
      process.stderr.write = write;
      process.exitCode = originalExitCode ?? 0;
    }
    expect(commandDispatched).toBeFalse();
  });

  test("[WS-REMOTE-PROGRESS-201] code --no-attach from a non-git cwd occupies this folder, not examples", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "appaloft-code-nongit-"));
    const home = await mkdtemp(join(tmpdir(), "appaloft-code-nongit-home-"));
    const commands: Command<unknown>[] = [];
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async <T>(_context: unknown, command: Command<T>) => {
          commands.push(command as Command<unknown>);
          if (command instanceof CreateProjectCommand) return ok({ id: "prj_folder" } as T);
          return ok({ workspaceId: "sbx_folder" } as T);
        },
      } as unknown as CommandBus,
      queryBus: {
        execute: async <T>(_context: unknown, query: Query<T>) => {
          if (query instanceof ListServersQuery) {
            return ok({
              items: [{ id: "srv_1", name: "hostinger", lifecycleStatus: "active" }],
            } as T);
          }
          if (query instanceof ListSandboxesQuery) {
            return ok({
              items: [
                {
                  sandboxId: "sbx_examples",
                  status: "ready",
                  occupancy: {
                    repositoryIdentity: "github.com/appaloft/examples",
                    commitSha: "b".repeat(40),
                    branch: "main",
                  },
                },
              ],
            } as T);
          }
          if (query instanceof ShowProjectQuery) {
            return ok({
              id: "prj_folder",
              name: basename(emptyDir),
              lifecycleStatus: "active",
            } as T);
          }
          if (query instanceof ListProjectsQuery) {
            return ok({ items: [], total: 0, limit: 100, offset: 0 } as T);
          }
          return ok({ items: [] } as T);
        },
      } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) => createExecutionContext({ ...input, requestId: "req_code_nongit" }),
      },
      environment: { APPALOFT_TOKEN: "token", APPALOFT_HOME: home },
      terminalIO: {
        stdin: { isTTY: false, on: () => undefined },
        stdout: { isTTY: false, write: () => true },
        stderr: { isTTY: false, write: () => true },
      },
    });
    const originalExitCode = process.exitCode;
    const write = process.stderr.write;
    process.stderr.write = (() => true) as typeof process.stderr.write;
    try {
      await program.parseAsync(["node", "appaloft", "code", emptyDir, "--no-attach"]);
    } finally {
      process.stderr.write = write;
      process.exitCode = originalExitCode ?? 0;
      await rm(emptyDir, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
    }
    const opened = commands.find((command) => command instanceof OpenAgentWorkspaceCommand);
    expect(opened).toBeDefined();
    expect(opened).toMatchObject({
      input: {
        repositoryIdentity: folderOccupancyIdentity(basename(emptyDir)),
        branch: "local",
        attach: false,
      },
    });
    expect(opened).not.toMatchObject({
      input: { repositoryIdentity: "github.com/appaloft/examples" },
    });
    expect(commands.some((command) => command instanceof CreateProjectCommand)).toBe(true);
  });

  test("[WS-REMOTE-PROGRESS-201] code --no-attach from a no-git cwd does not resume leftover examples", async () => {
    const ancestor = await mkdtemp(join(tmpdir(), "appaloft-code-examples-ancestor-"));
    const emptyDir = join(ancestor, "scratch");
    await mkdir(emptyDir);
    const home = await mkdtemp(join(tmpdir(), "appaloft-code-examples-home-"));
    const git = async (args: readonly string[]) => {
      const result = await Bun.spawn(["git", ...args], {
        cwd: ancestor,
        stdout: "pipe",
        stderr: "pipe",
      }).exited;
      if (result !== 0) throw new Error(`git ${args.join(" ")} failed`);
    };
    await git(["init"]);
    await git(["remote", "add", "origin", "https://github.com/appaloft/examples.git"]);
    const commands: Command<unknown>[] = [];
    const printed: string[] = [];
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async <T>(_context: unknown, command: Command<T>) => {
          commands.push(command as Command<unknown>);
          if (command instanceof CreateProjectCommand) return ok({ id: "prj_folder" } as T);
          return ok({ workspaceId: "sbx_folder" } as T);
        },
      } as unknown as CommandBus,
      queryBus: {
        execute: async <T>(_context: unknown, query: Query<T>) => {
          if (query instanceof ListServersQuery) {
            return ok({
              items: [{ id: "srv_4lifk0yrcecy", name: "hostinger", lifecycleStatus: "active" }],
            } as T);
          }
          if (query instanceof ListSandboxesQuery) {
            return ok({
              items: [
                {
                  sandboxId: "sbx_c343gwqfn7yd",
                  status: "ready",
                  occupancy: {
                    repositoryIdentity: "github.com/appaloft/examples",
                    commitSha: "1a23b77000000000000000000000000000000000",
                    branch: "main",
                  },
                  lastActivityAt: "2026-08-20T12:30:00.000Z",
                },
              ],
            } as T);
          }
          if (query instanceof ShowProjectQuery) {
            return ok({
              id: "prj_folder",
              name: "scratch",
              lifecycleStatus: "active",
            } as T);
          }
          if (query instanceof ListProjectsQuery) {
            return ok({ items: [], total: 0, limit: 100, offset: 0 } as T);
          }
          return ok({ items: [] } as T);
        },
      } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) => createExecutionContext({ ...input, requestId: "req_code_nongit_cwd" }),
      },
      environment: { APPALOFT_TOKEN: "token", APPALOFT_HOME: home, HOME: home },
      terminalIO: {
        stdin: { isTTY: false, on: () => undefined },
        stdout: { isTTY: false, write: () => true },
        stderr: { isTTY: false, write: () => true },
      },
    });
    const originalExitCode = process.exitCode;
    const previousCwd = process.cwd();
    const writeOut = process.stdout.write;
    const writeErr = process.stderr.write;
    const capture = ((chunk: unknown) => {
      printed.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    process.stdout.write = capture;
    process.stderr.write = capture;
    try {
      process.chdir(emptyDir);
      await program.parseAsync(["node", "appaloft", "code", "--no-attach"]);
    } finally {
      process.chdir(previousCwd);
      process.stdout.write = writeOut;
      process.stderr.write = writeErr;
      process.exitCode = originalExitCode ?? 0;
      await rm(ancestor, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
    }
    const opened = commands.find((command) => command instanceof OpenAgentWorkspaceCommand);
    expect(opened).toBeDefined();
    expect(opened).toMatchObject({
      input: {
        repository: "https://folder.local/cwd/scratch.git",
        repositoryIdentity: folderOccupancyIdentity("scratch"),
        branch: "local",
        attach: false,
      },
    });
    expect(opened).not.toMatchObject({
      input: { repositoryIdentity: "github.com/appaloft/examples" },
    });
    expect(opened).not.toMatchObject({
      input: { workspaceId: "sbx_c343gwqfn7yd" },
    });
    const text = printed.join("");
    expect(text.toLowerCase()).not.toContain("occupancy");
    expect(text).not.toContain("Copying skills");
    expect(text).not.toContain("Choosing occupancy");
    expect(text).not.toContain("github.com/appaloft/examples");
    expect(text).not.toContain("sslip");
    expect(text).not.toContain("RAILWAY_PUBLIC_DOMAIN");
  });

  test("[WS-REMOTE-NO-UPLOAD-006] code --new --no-attach from a no-git cwd stays fail-closed", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "appaloft-code-new-cwd-"));
    const home = await mkdtemp(join(tmpdir(), "appaloft-code-new-cwd-home-"));
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
      queryBus: {
        execute: async <T>(_context: unknown, query: Query<T>) => {
          if (query instanceof ListServersQuery) {
            return ok({
              items: [{ id: "srv_4lifk0yrcecy", name: "hostinger", lifecycleStatus: "active" }],
            } as T);
          }
          if (query instanceof ListSandboxesQuery) {
            return ok({
              items: [
                {
                  sandboxId: "sbx_c343gwqfn7yd",
                  status: "ready",
                  occupancy: {
                    repositoryIdentity: "github.com/appaloft/examples",
                    commitSha: "1a23b77000000000000000000000000000000000",
                    branch: "main",
                  },
                },
              ],
            } as T);
          }
          return ok({ items: [] } as T);
        },
      } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) => createExecutionContext({ ...input, requestId: "req_code_new_nongit" }),
      },
      environment: { APPALOFT_TOKEN: "token", APPALOFT_HOME: home, HOME: home },
      terminalIO: {
        stdin: { isTTY: false, on: () => undefined },
        stdout: { isTTY: false, write: () => true },
        stderr: { isTTY: false, write: () => true },
      },
    });
    const originalExitCode = process.exitCode;
    const previousCwd = process.cwd();
    const write = process.stderr.write;
    process.stderr.write = (() => true) as typeof process.stderr.write;
    try {
      process.chdir(emptyDir);
      await program.parseAsync(["node", "appaloft", "code", "--new", "--no-attach"]);
      throw new Error("Expected --new without a locator to fail closed");
    } catch (error) {
      const errorText = String(error);
      expect(errorText).toContain("workspace_remote_repository_missing");
      expect(errorText).not.toContain("github.com/appaloft/examples");
    } finally {
      process.chdir(previousCwd);
      process.stderr.write = write;
      process.exitCode = originalExitCode ?? 0;
      await rm(emptyDir, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
    }
    expect(commands.some((command) => command instanceof OpenAgentWorkspaceCommand)).toBe(false);
  });

  test("[WS-REMOTE-PROGRESS-201][FOLDER-ONBOARD-007] code --no-attach recovers a leftover partial folder occupancy without dumping partial_recovery", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "appaloft-code-partial-cwd-"));
    const home = await mkdtemp(join(tmpdir(), "appaloft-code-partial-cwd-home-"));
    const commands: Command<unknown>[] = [];
    const printed: string[] = [];
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async <T>(_context: unknown, command: Command<T>) => {
          commands.push(command as Command<unknown>);
          if (command instanceof CreateProjectCommand) return ok({ id: "prj_7fky4yjn1l1c" } as T);
          if (command instanceof OpenAgentWorkspaceCommand) {
            if (!command.input.forceNew) {
              return err(
                domainError.conflict("Preferred Workspace is partially created", {
                  code: "workspace_open_partial_recovery_required",
                  workspaceId: "sbx_partial",
                  phase: "workspace-open-source-materialization",
                  guidance:
                    "Inspect or terminate the partial Workspace, then use --new to create an isolated replacement.",
                }),
              );
            }
            return ok({ workspaceId: "sbx_replaced" } as T);
          }
          return ok({} as T);
        },
      } as unknown as CommandBus,
      queryBus: {
        execute: async <T>(_context: unknown, query: Query<T>) => {
          if (query instanceof ListServersQuery) {
            return ok({
              items: [{ id: "srv_4lifk0yrcecy", name: "hostinger", lifecycleStatus: "active" }],
            } as T);
          }
          if (query instanceof ListSandboxesQuery) {
            return ok({
              items: [
                {
                  sandboxId: "sbx_partial",
                  status: "creating",
                  occupancy: {
                    repositoryIdentity: folderOccupancyIdentity(basename(emptyDir)),
                    commitSha: "cafef00d00000000000000000000000000000000",
                    branch: "local",
                  },
                },
              ],
            } as T);
          }
          if (query instanceof ShowProjectQuery) {
            return ok({
              id: "prj_7fky4yjn1l1c",
              name: basename(emptyDir),
              lifecycleStatus: "active",
            } as T);
          }
          if (query instanceof ListProjectsQuery) {
            return ok({ items: [], total: 0, limit: 100, offset: 0 } as T);
          }
          return ok({ items: [] } as T);
        },
      } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) => createExecutionContext({ ...input, requestId: "req_code_partial" }),
      },
      environment: { APPALOFT_TOKEN: "token", APPALOFT_HOME: home, HOME: home },
      terminalIO: {
        stdin: { isTTY: false, on: () => undefined },
        stdout: { isTTY: false, write: () => true },
        stderr: { isTTY: false, write: () => true },
      },
    });
    const originalExitCode = process.exitCode;
    const previousCwd = process.cwd();
    const writeOut = process.stdout.write;
    const writeErr = process.stderr.write;
    const capture = ((chunk: unknown) => {
      printed.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    process.stdout.write = capture;
    process.stderr.write = capture;
    try {
      process.chdir(emptyDir);
      await program.parseAsync(["node", "appaloft", "code", "--no-attach"]);
    } finally {
      process.chdir(previousCwd);
      process.stdout.write = writeOut;
      process.stderr.write = writeErr;
      process.exitCode = originalExitCode ?? 0;
      await rm(emptyDir, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
    }
    const opens = commands.filter((command) => command instanceof OpenAgentWorkspaceCommand);
    expect(opens).toHaveLength(2);
    expect(opens[0]).toMatchObject({
      input: {
        repositoryIdentity: folderOccupancyIdentity(basename(emptyDir)),
        forceNew: false,
        attach: false,
      },
    });
    expect(opens[1]).toMatchObject({
      input: {
        repositoryIdentity: folderOccupancyIdentity(basename(emptyDir)),
        forceNew: true,
        attach: false,
      },
    });
    const text = printed.join("");
    expect(text).not.toContain("workspace_open_partial_recovery_required");
    expect(text).not.toContain("Preferred Workspace is partially created");
    expect(text).not.toContain("use --new to create an isolated replacement");
    expect(text.toLowerCase()).not.toContain("occupancy");
    expect(text).not.toContain("sslip");
    expect(text).not.toContain("github.com/appaloft/examples");
  });

  test("[FOLDER-ONBOARD-007] code --no-attach from a non-git cwd occupies this folder when no occupancy exists", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "appaloft-code-nongit-empty-"));
    const home = await mkdtemp(join(tmpdir(), "appaloft-code-nongit-empty-home-"));
    const commands: Command<unknown>[] = [];
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async <T>(_context: unknown, command: Command<T>) => {
          commands.push(command as Command<unknown>);
          if (command instanceof CreateProjectCommand) return ok({ id: "prj_folder" } as T);
          return ok({ workspaceId: "sbx_folder" } as T);
        },
      } as unknown as CommandBus,
      queryBus: {
        execute: async <T>(_context: unknown, query: Query<T>) => {
          if (query instanceof ListServersQuery) {
            return ok({
              items: [{ id: "srv_1", name: "hostinger", lifecycleStatus: "active" }],
            } as T);
          }
          if (query instanceof ListSandboxesQuery) {
            return ok({ items: [] } as T);
          }
          if (query instanceof ShowProjectQuery) {
            return ok({
              id: "prj_folder",
              name: basename(emptyDir),
              lifecycleStatus: "active",
            } as T);
          }
          if (query instanceof ListProjectsQuery) {
            return ok({ items: [], total: 0, limit: 100, offset: 0 } as T);
          }
          return ok({ items: [] } as T);
        },
      } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) => createExecutionContext({ ...input, requestId: "req_code_nongit_empty" }),
      },
      environment: { APPALOFT_TOKEN: "token", APPALOFT_HOME: home },
      terminalIO: {
        stdin: { isTTY: false, on: () => undefined },
        stdout: { isTTY: false, write: () => true },
        stderr: { isTTY: false, write: () => true },
      },
    });
    const originalExitCode = process.exitCode;
    const write = process.stderr.write;
    process.stderr.write = (() => true) as typeof process.stderr.write;
    try {
      await program.parseAsync(["node", "appaloft", "code", emptyDir, "--no-attach"]);
    } finally {
      process.stderr.write = write;
      process.exitCode = originalExitCode ?? 0;
      await rm(emptyDir, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
    }
    const opened = commands.find((command) => command instanceof OpenAgentWorkspaceCommand);
    expect(opened).toBeDefined();
    expect(opened).toMatchObject({
      input: {
        repositoryIdentity: folderOccupancyIdentity(basename(emptyDir)),
        branch: "local",
      },
    });
    expect(commands.some((command) => command instanceof CreateProjectCommand)).toBe(true);
  });

  test("[FOLDER-ONBOARD-007][WS-REMOTE-PROGRESS-201] no-git code --no-attach occupies folder.local without git clone or materialize", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "nux-code-silence-cwd-"));
    const home = await mkdtemp(join(tmpdir(), "nux-code-silence-home-"));
    const executedCommands: string[][] = [];
    const openCommands: OpenAgentWorkspaceCommand[] = [];
    const printed: string[] = [];
    const { service } = createCliFolderOccupancyOpen({ executedCommands });
    const handler = new AgentWorkspaceOpenCommandHandler(service);
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async <T>(context: unknown, command: Command<T>) => {
          if (command instanceof CreateProjectCommand) return ok({ id: "prj_7fky4yjn1l1c" } as T);
          if (command instanceof OpenAgentWorkspaceCommand) {
            openCommands.push(command);
            const opened = await handler.handle(
              context as Parameters<AgentWorkspaceOpenCommandHandler["handle"]>[0],
              command,
            );
            return opened as never;
          }
          return ok({} as T);
        },
      } as unknown as CommandBus,
      queryBus: {
        execute: async <T>(_context: unknown, query: Query<T>) => {
          if (query instanceof ListServersQuery) {
            return ok({
              items: [{ id: "srv_4lifk0yrcecy", name: "hostinger", lifecycleStatus: "active" }],
            } as T);
          }
          if (query instanceof ListSandboxesQuery) {
            return ok({ items: [] } as T);
          }
          if (query instanceof ShowProjectQuery) {
            return ok({
              id: "prj_7fky4yjn1l1c",
              name: basename(emptyDir),
              lifecycleStatus: "active",
            } as T);
          }
          if (query instanceof ListProjectsQuery) {
            return ok({ items: [], total: 0, limit: 100, offset: 0 } as T);
          }
          return ok({ items: [] } as T);
        },
      } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) =>
          createExecutionContext({ ...input, requestId: "req_code_folder_local_gate" }),
      },
      environment: { APPALOFT_TOKEN: "token", APPALOFT_HOME: home, HOME: home },
      terminalIO: {
        stdin: { isTTY: false, on: () => undefined },
        stdout: { isTTY: false, write: () => true },
        stderr: { isTTY: false, write: () => true },
      },
    });
    const originalExitCode = process.exitCode;
    const previousCwd = process.cwd();
    const writeOut = process.stdout.write;
    const writeErr = process.stderr.write;
    const capture = ((chunk: unknown) => {
      printed.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    process.stdout.write = capture;
    process.stderr.write = capture;
    try {
      process.chdir(emptyDir);
      await program.parseAsync(["node", "appaloft", "code", "--no-attach"]);
    } finally {
      process.chdir(previousCwd);
      process.stdout.write = writeOut;
      process.stderr.write = writeErr;
      process.exitCode = originalExitCode ?? 0;
      await rm(emptyDir, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
    }
    const text = printed.join("");
    expect(openCommands).toHaveLength(1);
    expect(openCommands[0]?.input).toMatchObject({
      repositoryIdentity: folderOccupancyIdentity(basename(emptyDir)),
      repository: `https://${folderOccupancyIdentity(basename(emptyDir))}.git`,
      branch: "local",
      ref: "refs/heads/local",
      targetServerId: "srv_4lifk0yrcecy",
      attach: false,
    });
    expect(openCommands[0]?.input.repository).not.toContain("github.com");
    expect(openCommands[0]?.input.repositoryIdentity.startsWith("folder.local/")).toBe(true);
    expect(executedCommands).toEqual([]);
    expect(executedCommands.some((argv) => argv[0] === "git")).toBe(false);
    expect(executedCommands.some((argv) => argv.includes("clone"))).toBe(false);
    expect(executedCommands.some((argv) => argv.includes("fetch"))).toBe(false);
    expect(text).not.toContain("workspace_open_source_materialization_failed");
    expect(text).not.toContain("Workspace source materialization failed");
    expect(text).not.toContain("workspace_open_partial_recovery_required");
    expect(text).not.toContain("use --new");
    expect(text.toLowerCase()).not.toContain("occupancy");
    expect(process.exitCode === undefined || process.exitCode === 0).toBe(true);
  });

  test("[FOLDER-ONBOARD-007][WS-REMOTE-PROGRESS-201] leftover no-git code --no-attach repairs without clone or --new", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "nux-code-silence-partial-"));
    const home = await mkdtemp(join(tmpdir(), "nux-code-silence-partial-home-"));
    const executedCommands: string[][] = [];
    const openCommands: OpenAgentWorkspaceCommand[] = [];
    const printed: string[] = [];
    const identity = folderOccupancyIdentity(basename(emptyDir));
    const { service } = createCliFolderOccupancyOpen({
      executedCommands,
      preferred: {
        workspaceId: "sbx_partial",
        commitSha: "cafef00d00000000000000000000000000000000",
        profileInstallationId: "awpi_default",
        status: "partial",
        phase: "workspace-open-source-materialization",
        repositoryIdentity: identity,
        targetSelection: {
          targetClass: "registered-server",
          source: "explicit",
          reason: "code_target_server",
        },
      },
    });
    const handler = new AgentWorkspaceOpenCommandHandler(service);
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async <T>(context: unknown, command: Command<T>) => {
          if (command instanceof CreateProjectCommand) return ok({ id: "prj_7fky4yjn1l1c" } as T);
          if (command instanceof OpenAgentWorkspaceCommand) {
            openCommands.push(command);
            return (await handler.handle(
              context as Parameters<AgentWorkspaceOpenCommandHandler["handle"]>[0],
              command,
            )) as never;
          }
          return ok({} as T);
        },
      } as unknown as CommandBus,
      queryBus: {
        execute: async <T>(_context: unknown, query: Query<T>) => {
          if (query instanceof ListServersQuery) {
            return ok({
              items: [{ id: "srv_4lifk0yrcecy", name: "hostinger", lifecycleStatus: "active" }],
            } as T);
          }
          if (query instanceof ListSandboxesQuery) {
            return ok({
              items: [
                {
                  sandboxId: "sbx_partial",
                  status: "creating",
                  occupancy: {
                    repositoryIdentity: identity,
                    commitSha: "cafef00d00000000000000000000000000000000",
                    branch: "local",
                  },
                },
              ],
            } as T);
          }
          if (query instanceof ShowProjectQuery) {
            return ok({
              id: "prj_7fky4yjn1l1c",
              name: basename(emptyDir),
              lifecycleStatus: "active",
            } as T);
          }
          if (query instanceof ListProjectsQuery) {
            return ok({ items: [], total: 0, limit: 100, offset: 0 } as T);
          }
          return ok({ items: [] } as T);
        },
      } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) =>
          createExecutionContext({ ...input, requestId: "req_code_folder_local_leftover" }),
      },
      environment: { APPALOFT_TOKEN: "token", APPALOFT_HOME: home, HOME: home },
      terminalIO: {
        stdin: { isTTY: false, on: () => undefined },
        stdout: { isTTY: false, write: () => true },
        stderr: { isTTY: false, write: () => true },
      },
    });
    const originalExitCode = process.exitCode;
    const previousCwd = process.cwd();
    const writeOut = process.stdout.write;
    const writeErr = process.stderr.write;
    const capture = ((chunk: unknown) => {
      printed.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    process.stdout.write = capture;
    process.stderr.write = capture;
    try {
      process.chdir(emptyDir);
      await program.parseAsync(["node", "appaloft", "code", "--no-attach"]);
    } finally {
      process.chdir(previousCwd);
      process.stdout.write = writeOut;
      process.stderr.write = writeErr;
      process.exitCode = originalExitCode ?? 0;
      await rm(emptyDir, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
    }
    const text = printed.join("");
    expect(openCommands.length).toBeGreaterThanOrEqual(1);
    expect(openCommands.every((command) => command.input.repository.includes("folder.local"))).toBe(
      true,
    );
    expect(openCommands.every((command) => !command.input.repository.includes("github.com"))).toBe(
      true,
    );
    expect(executedCommands).toEqual([]);
    expect(text).not.toContain("workspace_open_source_materialization_failed");
    expect(text).not.toContain("workspace_open_partial_recovery_required");
    expect(text).not.toContain("use --new");
    expect(process.exitCode === undefined || process.exitCode === 0).toBe(true);
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
    let queryCount = 0;
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
      queryBus: {
        execute: async () => {
          queryCount += 1;
          return ok({ items: [] });
        },
      } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) => createExecutionContext({ ...input, requestId: "req_remote_login" }),
      },
      environment: {
        APPALOFT_HOME: join(tmpdir(), "appaloft-unauthenticated-code"),
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
      expect(String(error)).toContain("Run appaloft login");
      expect(String(error)).not.toContain("workspace_remote_server_missing");
    } finally {
      process.stderr.write = write;
      process.exitCode = originalExitCode ?? 0;
    }
    expect(commands).toEqual([]);
    expect(queryCount).toBe(0);
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
      "Connect a model in OpenCode with /connect before running a Task.",
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
    const printed = output.join("");
    expect(printed).toContain("Connect a model in OpenCode with /connect before running a Task.");
    expect(printed).toMatch(
      /Open · --open-target preview\|compare(?:\|connections)? · workspace p\/c(?:\/g)?/,
    );
    expect(printed).toMatch(
      /GitHub PR · connect repo at (?:https?:\/\/[^\s]+)?\/account\/connections or install the App with contents\/PR write\./,
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
    const isolatedHome = await mkdtemp(join(tmpdir(), "appaloft-code-new-home-"));
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
      environment: { HOME: isolatedHome, PATH: "/usr/bin", TERM: "dumb" },
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

    try {
      await program.parseAsync(["node", "appaloft", "code", "--new", "--no-attach"]);
    } finally {
      await rm(isolatedHome, { recursive: true, force: true });
    }

    expect((commands[0] as OpenAgentWorkspaceCommand).input).toMatchObject({
      forceNew: true,
      attach: false,
      targetServerId: "srv_1",
      repository: "https://github.com/acme/api.git",
      repositoryIdentity: "github.com/acme/api",
    });
    expect((commands[0] as OpenAgentWorkspaceCommand).input.profile).toBeUndefined();
  });

  test("[WS-REMOTE-CODE-PROFILE-177] code --profile passes the selector through", async () => {
    const commands: Command<unknown>[] = [];
    const { createCliProgram } = await import("../src");
    const { OpenAgentWorkspaceCommand } = await import("@appaloft/application");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async <T>(_context: unknown, command: Command<T>) => {
          commands.push(command as Command<unknown>);
          return ok({ workspaceId: "sbx_profile", projectId: "prj_billing" } as T);
        },
      } as unknown as CommandBus,
      queryBus: { execute: async () => ok({ items: [] }) } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) => createExecutionContext({ ...input, requestId: "req_code_profile" }),
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

    await program.parseAsync([
      "node",
      "appaloft",
      "code",
      "--profile",
      "awpi_ptlsoktb2iq1",
      "--no-attach",
    ]);

    expect((commands[0] as OpenAgentWorkspaceCommand).input).toMatchObject({
      attach: false,
      targetServerId: "srv_1",
      profile: "awpi_ptlsoktb2iq1",
    });
  });

  test("[WS-REMOTE-HARNESS-175] code --harness pi occupies the Pi profile", async () => {
    const commands: Command<unknown>[] = [];
    const { createCliProgram } = await import("../src");
    const { OpenAgentWorkspaceCommand } = await import("@appaloft/application");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async <T>(_context: unknown, command: Command<T>) => {
          commands.push(command as Command<unknown>);
          return ok({
            workspaceId: "aws_pi",
            sandboxId: "sbx_pi",
            runtimeId: "sar_pi",
          } as T);
        },
      } as unknown as CommandBus,
      queryBus: { execute: async () => ok({ items: [] }) } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) => createExecutionContext({ ...input, requestId: "req_code_pi" }),
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

    await program.parseAsync([
      "node",
      "appaloft",
      "code",
      "--harness",
      "pi",
      "--new",
      "--no-attach",
    ]);

    expect((commands[0] as OpenAgentWorkspaceCommand).input).toMatchObject({
      forceNew: true,
      attach: false,
      targetServerId: "srv_1",
      profile: "appaloft-remote-pi",
    });
  });

  test("[WS-REMOTE-VENDOR-207] code --pi occupies the Pi profile", async () => {
    const commands: Command<unknown>[] = [];
    const { createCliProgram } = await import("../src");
    const { OpenAgentWorkspaceCommand } = await import("@appaloft/application");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async <T>(_context: unknown, command: Command<T>) => {
          commands.push(command as Command<unknown>);
          return ok({
            workspaceId: "aws_pi_alias",
            sandboxId: "sbx_pi_alias",
            runtimeId: "sar_pi_alias",
          } as T);
        },
      } as unknown as CommandBus,
      queryBus: { execute: async () => ok({ items: [] }) } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) => createExecutionContext({ ...input, requestId: "req_code_pi_alias" }),
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

    await program.parseAsync(["node", "appaloft", "code", "--pi", "--new", "--no-attach"]);

    expect((commands[0] as OpenAgentWorkspaceCommand).input).toMatchObject({
      forceNew: true,
      attach: false,
      targetServerId: "srv_1",
      profile: "appaloft-remote-pi",
    });
  });

  test("[WS-REMOTE-VENDOR-204][WS-REMOTE-CRED-208] code --grok writes auth.json onto occupancy disk", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "appaloft-code-grok-"));
    await mkdir(join(homeDir, ".grok"), { recursive: true });
    await writeFile(join(homeDir, ".grok", "auth.json"), '{"access_token":"grok-secret"}\n');
    const commands: Command<unknown>[] = [];
    const output: string[] = [];
    const { createCliProgram } = await import("../src");
    const { OpenAgentWorkspaceCommand, WriteSandboxFileCommand } = await import(
      "@appaloft/application"
    );
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async <T>(_context: unknown, command: Command<T>) => {
          commands.push(command as Command<unknown>);
          if (command instanceof OpenAgentWorkspaceCommand) {
            return ok({
              workspaceId: "sbx_grok",
              sandboxId: "sbx_grok",
              runtimeId: "sar_grok",
              projectId: "prj_billing",
            } as T);
          }
          return ok({} as T);
        },
      } as unknown as CommandBus,
      queryBus: {
        execute: async () => err({ message: "missing" } as never),
      } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) => createExecutionContext({ ...input, requestId: "req_code_grok" }),
      },
      environment: { HOME: homeDir },
      resolveRemoteCodeDoor: async () => ({
        repository: "https://github.com/acme/api.git",
        repositoryIdentity: "github.com/acme/api",
        ref: "refs/heads/main",
        branch: "main",
        commitSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        projectId: "prj_billing",
        serverId: "srv_4lifk0yrcecy",
        serverName: "hostinger",
      }),
    });
    const write = process.stdout.write;
    process.stdout.write = ((chunk) => {
      output.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      await program.parseAsync(["node", "appaloft", "code", "--grok", "--new", "--no-attach"]);
    } finally {
      process.stdout.write = write;
    }

    expect((commands[0] as OpenAgentWorkspaceCommand).input).toMatchObject({
      forceNew: true,
      attach: false,
      targetServerId: "srv_4lifk0yrcecy",
    });
    expect((commands[0] as OpenAgentWorkspaceCommand).input.profile).toBeUndefined();
    const written = commands
      .filter((command) => command instanceof WriteSandboxFileCommand)
      .map((command) => command.input.path);
    expect(written).toContain(".grok/auth.json");
    expect(written).toContain(".mcp.json");
    const printed = output.join("");
    expect(printed).toContain("using your Grok credential");
    expect(printed).toMatch(/including \d+ skills/);
    expect(printed).toContain("work is on its disk");
    expect(printed).not.toContain("grok-secret");
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
          if (!(command instanceof OpenAgentWorkspaceCommand)) {
            return ok({} as T);
          }
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

    const opens = commands.filter((command) => command instanceof OpenAgentWorkspaceCommand);
    expect(opens).toHaveLength(2);
    expect(opens[0]?.input.commitSha).toBe("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    expect(opens[1]?.input).toMatchObject({
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
      "Connect a model in OpenCode with /connect before running a Task.",
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
          if (!(command instanceof OpenAgentWorkspaceCommand)) {
            return ok({} as T);
          }
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

  test("[WS-REMOTE-PROGRESS-187][WS-REMOTE-PROGRESS-188][WS-REMOTE-NO-ATTACH-016] --no-attach prints progress before occupy and does not attach", async () => {
    const output: string[] = [];
    const events: string[] = [];
    const { createCliProgram } = await import("../src");
    const { OpenAgentWorkspaceCommand } = await import("@appaloft/application");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async <T>(_context: unknown, command: Command<T>) => {
          if (command instanceof OpenAgentWorkspaceCommand) {
            expect(output.join("")).toContain("Preparing disk on hostinger…");
            events.push("occupy");
            await Bun.sleep(15);
            return ok({ workspaceId: "sbx_progress", projectId: "prj_web" } as T);
          }
          events.push("skill");
          return ok({} as T);
        },
      } as unknown as CommandBus,
      queryBus: { execute: async () => ok({ items: [] }) } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) =>
          createExecutionContext({ ...input, requestId: "req_code_progress_no_attach" }),
      },
      resolveRemoteCodeDoor: async () => {
        expect(output.join("")).toContain("Checking login…");
        events.push("door");
        await Bun.sleep(15);
        return {
          repository: "https://github.com/acme/api.git",
          repositoryIdentity: "github.com/acme/api",
          ref: "refs/heads/main",
          branch: "main",
          commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          projectId: "prj_web",
          serverId: "srv_4lifk0yrcecy",
          serverName: "hostinger",
        };
      },
      launchNativeWorkspaceClient: async () => {
        events.push("attach");
      },
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
    const printed = output.join("");
    expect(events[0]).toBe("door");
    expect(events).toContain("occupy");
    expect(events).not.toContain("attach");
    expect(printed).toContain("Checking login…");
    expect(printed).toContain("Using this project…");
    expect(printed).toContain("Preparing disk on hostinger…");
    expect(printed).toContain("Preparing skills…");
    expect(printed).not.toContain("Choosing occupancy");
    expect(printed).not.toContain("Opening occupancy");
    expect(printed.toLowerCase()).not.toContain("occupancy");
    expect(printed).toContain(
      "Remote · prj_web · github.com/acme/api@aaaaaaa · hostinger · my sandbox · sbx_progress",
    );
    expect(printed.indexOf("Preparing disk on hostinger…")).toBeLessThan(
      printed.indexOf("Remote ·"),
    );
    expect(printed.indexOf("Remote ·")).toBeLessThan(printed.indexOf("Preparing skills…"));
  });

  test("[FOLDER-ONBOARD-007] folder.local --no-attach Remote banner uses this-folder project, not leftover binding", async () => {
    const output: string[] = [];
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async <T>(_context: unknown, command: Command<T>) => {
          if (command instanceof OpenAgentWorkspaceCommand) {
            return ok({
              workspaceId: "sbx_folder",
              projectId: "prj_vlhs6pf8v4yp",
            } as T);
          }
          return ok({} as T);
        },
      } as unknown as CommandBus,
      queryBus: { execute: async () => ok({ items: [] }) } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) =>
          createExecutionContext({ ...input, requestId: "req_code_folder_banner_project" }),
      },
      resolveRemoteCodeDoor: async () => ({
        repository: "https://folder.local/cwd/nux-code-silence-cwd.git",
        repositoryIdentity: folderOccupancyIdentity("nux-code-silence-cwd"),
        ref: "refs/heads/local",
        branch: "local",
        commitSha: "cafef00d00000000000000000000000000000000",
        projectId: "prj_7fky4yjn1l1c",
        serverId: "srv_4lifk0yrcecy",
        serverName: "hostinger",
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
    const printed = output.join("");
    expect(printed).toContain(
      "Remote · prj_7fky4yjn1l1c · folder.local/cwd/nux-code-silence-cwd@cafef00 · hostinger · my sandbox · sbx_folder",
    );
    expect(printed).not.toContain("prj_vlhs6pf8v4yp");
    expect(printed.toLowerCase()).not.toContain("occupancy");
  });

  test("[WS-REMOTE-PROGRESS-192] --no-attach prints Remote banner before a hung skill copy and still exits", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "appaloft-code-hung-"));
    await mkdir(join(homeDir, ".grok", "skills", "plan"), { recursive: true });
    await writeFile(join(homeDir, ".grok", "auth.json"), '{"access_token":"grok-secret"}\n');
    await writeFile(join(homeDir, ".grok", "skills", "plan", "SKILL.md"), "# Plan\n");
    const output: string[] = [];
    let releaseHang: (() => void) | undefined;
    const hungSkill = new Promise<void>((resolve) => {
      releaseHang = resolve;
    });
    const previousOfferTimeout = process.env.APPALOFT_OCCUPANCY_SKILL_OFFER_TIMEOUT_MS;
    const previousCommandTimeout = process.env.APPALOFT_OCCUPANCY_SKILL_COMMAND_TIMEOUT_MS;
    process.env.APPALOFT_OCCUPANCY_SKILL_OFFER_TIMEOUT_MS = "25";
    process.env.APPALOFT_OCCUPANCY_SKILL_COMMAND_TIMEOUT_MS = "25";
    const { createCliProgram } = await import("../src");
    const { OpenAgentWorkspaceCommand, WriteSandboxFileCommand } = await import(
      "@appaloft/application"
    );
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async <T>(_context: unknown, command: Command<T>) => {
          if (command instanceof OpenAgentWorkspaceCommand) {
            return ok({ workspaceId: "sbx_hung_skill", projectId: "prj_web" } as T);
          }
          if (
            command instanceof WriteSandboxFileCommand &&
            command.input.path.includes("skills/")
          ) {
            await hungSkill;
          }
          return ok({} as T);
        },
      } as unknown as CommandBus,
      queryBus: { execute: async () => ok({ items: [] }) } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) => createExecutionContext({ ...input, requestId: "req_code_hung_skill" }),
      },
      environment: { HOME: homeDir },
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
      launchNativeWorkspaceClient: async () => {
        throw new Error("hung skill copy must not attach");
      },
    });
    const write = process.stdout.write;
    process.stdout.write = ((chunk) => {
      output.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      await program.parseAsync(["node", "appaloft", "code", "--grok", "--no-attach"]);
    } finally {
      process.stdout.write = write;
      if (previousOfferTimeout === undefined) {
        delete process.env.APPALOFT_OCCUPANCY_SKILL_OFFER_TIMEOUT_MS;
      } else {
        process.env.APPALOFT_OCCUPANCY_SKILL_OFFER_TIMEOUT_MS = previousOfferTimeout;
      }
      if (previousCommandTimeout === undefined) {
        delete process.env.APPALOFT_OCCUPANCY_SKILL_COMMAND_TIMEOUT_MS;
      } else {
        process.env.APPALOFT_OCCUPANCY_SKILL_COMMAND_TIMEOUT_MS = previousCommandTimeout;
      }
      releaseHang?.();
    }
    const printed = output.join("");
    expect(printed).toContain(
      "Remote · prj_web · github.com/acme/api@aaaaaaa · hostinger · my sandbox · sbx_hung_skill",
    );
    expect(printed).toContain("Preparing skills…");
    expect(printed).toContain("using your Grok credential");
    expect(printed).toContain("including 0 skills");
    expect(printed).toContain("work is on its disk");
    expect(printed).not.toContain("grok-secret");
    expect(printed).not.toContain("Copying skills");
    expect(printed).not.toContain("Opening occupancy");
    expect(printed.indexOf("Remote ·")).toBeLessThan(printed.indexOf("Preparing skills…"));
  });

  test("[WS-REMOTE-PROGRESS-189][WS-REMOTE-ATTACH-134] default code attaches before optional skill copy finishes", async () => {
    const output: string[] = [];
    let attached = false;
    let skillCompletedBeforeAttach = false;
    const { createCliProgram } = await import("../src");
    const { OpenAgentWorkspaceCommand } = await import("@appaloft/application");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async <T>(_context: unknown, command: Command<T>) => {
          if (command instanceof OpenAgentWorkspaceCommand) {
            expect(output.join("")).toContain("Preparing disk on hostinger…");
            expect(attached).toBeFalse();
            return ok({
              workspaceId: "sbx_attach_first",
              projectId: "prj_web",
              attach: {
                transport: "native-attach",
                clientHandoff: "local-client-exec",
                clientCommand: ["opencode", "attach"],
              },
            } as T);
          }
          await Bun.sleep(40);
          if (!attached) skillCompletedBeforeAttach = true;
          return ok({} as T);
        },
      } as unknown as CommandBus,
      queryBus: { execute: async () => ok({ items: [] }) } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) =>
          createExecutionContext({ ...input, requestId: "req_code_progress_attach" }),
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
      launchNativeWorkspaceClient: async (argv) => {
        expect(argv).toEqual(["opencode", "attach"]);
        expect(output.join("")).toContain("Attaching…");
        attached = true;
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
    const printed = output.join("");
    expect(attached).toBeTrue();
    expect(skillCompletedBeforeAttach).toBeFalse();
    expect(printed).toContain("Preparing disk on hostinger…");
    expect(printed).toContain("Preparing skills…");
    expect(printed).toContain("Attaching…");
    expect(printed).toContain(
      "Remote · prj_web · github.com/acme/api@aaaaaaa · hostinger · my sandbox · sbx_attach_first",
    );
    expect(printed.indexOf("Preparing disk on hostinger…")).toBeLessThan(
      printed.indexOf("Remote ·"),
    );
    expect(printed.indexOf("Remote ·")).toBeLessThan(printed.indexOf("Attaching…"));
    expect(printed.indexOf("Remote ·")).toBeLessThan(printed.indexOf("Preparing skills…"));
  });

  test("[WS-REMOTE-PROGRESS-193] TTY code enters occupancy TUI without streamed line progress", async () => {
    await expectTtyCodeFirstChrome(["code"]);
  });

  test("[FOLDER-ONBOARD-009][WS-REMOTE-PROGRESS-193] TTY code --pi first chrome is Cloud Agents not Occupancy or workspace-list", async () => {
    await expectTtyCodeFirstChrome(["code", "--pi"]);
  });

  test("[FOLDER-ONBOARD-009] code TUI auto-creates and never starts a folder selector", async () => {
    let presentationStarts = 0;
    const output: string[] = [];
    const emptyDir = await mkdtemp(join(tmpdir(), "appaloft-code-cancel-"));
    const previousCwd = process.cwd();
    process.chdir(emptyDir);
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: { execute: async () => ok({}) } as unknown as CommandBus,
      queryBus: { execute: async () => ok({ items: [] }) } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) =>
          createExecutionContext({ ...input, requestId: "req_code_inquire_cancel" }),
      },
      terminalIO: {
        stdin: { isTTY: true, on: () => undefined },
        stdout: { isTTY: true, write: () => true },
        stderr: {
          isTTY: true,
          write: (chunk) => {
            output.push(String(chunk));
            return true;
          },
        },
      },
      environment: { HOME: emptyDir, PATH: "/usr/bin", TERM: "xterm-256color" },
      folderOnboardingInteraction: {
        text: () => {
          throw new Error("code session must not collect free text");
        },
        select: () => {
          throw new Error("code session must not select a project");
        },
        confirm: () => {
          throw new Error("code TUI must auto-create instead of inquiring");
        },
      },
      workspaceControlPresentation: {
        start: async () => {
          presentationStarts += 1;
        },
      },
    });
    try {
      await program.parseAsync(["node", "appaloft", "code", "--pi"]);
    } finally {
      process.chdir(previousCwd);
      await rm(emptyDir, { recursive: true, force: true });
    }
    expect(presentationStarts).toBe(1);
    expect(output.join("")).not.toMatch(/occupancy/iu);
  });

  test("[WS-REMOTE-PROGRESS-219] missing renderer restores TTY and never shows Occupancy", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "appaloft-code-missing-tui-"));
    const previousCwd = process.cwd();
    process.chdir(emptyDir);
    const { createCliProgram } = await import("../src");
    const { workspaceControlRendererUnavailableMessage } = await import(
      "../src/workspace-tui-launch.js"
    );
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async <T>(_context: unknown, command: Command<T>) => {
          if (command instanceof CreateProjectCommand) {
            return ok({ id: "prj_missing_tui", name: folderDirectoryName(emptyDir) } as T);
          }
          return ok({} as T);
        },
      } as unknown as CommandBus,
      queryBus: { execute: async () => ok({ items: [] }) } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) =>
          createExecutionContext({ ...input, requestId: "req_code_missing_renderer" }),
      },
      terminalIO: {
        stdin: { isTTY: true, on: () => undefined },
        stdout: { isTTY: true, write: () => true },
        stderr: { isTTY: true, write: () => true },
      },
      environment: { HOME: emptyDir, PATH: "/usr/bin", TERM: "xterm-256color" },
      folderOnboardingInteraction: {
        text: () => {
          throw new Error("code session must not collect free text");
        },
        select: () => {
          throw new Error("code session must not select a project");
        },
        confirm: () => Effect.succeed(true),
      },
      workspaceControlPresentation: {
        start: async () => {
          throw {
            code: "infra_error",
            category: "infra",
            message: workspaceControlRendererUnavailableMessage({ codeChrome: true }),
            retryable: false,
            details: { phase: "workspace-control-renderer", reason: "binary-missing" },
          };
        },
      },
    });
    const originalExitCode = process.exitCode;
    try {
      await program.parseAsync(["node", "appaloft", "code"]);
      throw new Error("Expected missing renderer to fail closed");
    } catch (error) {
      const text = String(error);
      expect(text).toContain("appaloft-workspace-tui");
      expect(text).toContain("rustup default stable");
      expect(text).toContain("cargo build");
      expect(text).toContain("--no-attach");
      expect(text).not.toMatch(/occupancy/iu);
      expect(text).not.toContain("could not choose a version of cargo");
      expect(text).not.toContain("Workspace CLI operation failed");
      expect(text).not.toContain("Select a Workspace to load bounded detail.");
    } finally {
      process.exitCode = originalExitCode ?? 0;
      process.chdir(previousCwd);
      await rm(emptyDir, { recursive: true, force: true });
    }
  });

  test("[FOLDER-ONBOARD-009] code TUI occupy auto-creates and never selects inside alt-screen", async () => {
    const source = await Bun.file(
      new URL("../src/commands/agent-workspace.ts", import.meta.url),
    ).text();
    expect(source).toContain('promptPolicy: "auto-create"');
    expect(source).toContain("yes: true");
    expect(source).toContain("writeStatus: () => undefined");
    expect(source).toContain("withImmediateSigintExit");
    expect(source).toContain("folderOnboardingCancelledError");
    const tuiBlockStart = source.indexOf("if (useOccupancyTui && occupancyTui)");
    const startAt = source.indexOf("occupancyTui.start(", tuiBlockStart);
    expect(tuiBlockStart).toBeGreaterThan(-1);
    expect(startAt).toBeGreaterThan(tuiBlockStart);
    expect(source.slice(tuiBlockStart, startAt)).not.toContain("ensureFolderProjectOnboarding");
    expect(source).not.toContain("codeSessionInquireInteraction");
    expect(source).not.toContain("interaction: effectCliInteraction");
    expect(source).not.toContain("effectCliInteraction");
    expect(source).not.toContain("This folder is not linked");
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
            workspaceId: "sbx_pi",
            runtimeId: "sar_pi",
            processId: "spr_pi",
            access: {
              kind: "websocket",
              path: "/api/terminal-sessions/term_pi/attach",
              expiresAt: "2026-07-28T01:00:00.000Z",
            },
          },
        } as T),
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: Query<T>) => {
        if (query instanceof ListServersQuery) {
          return ok({ items: [] } as T);
        }
        throw new Error(`occupancy attach must not re-query ${query.constructor.name}`);
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

  test("[WS-REMOTE-ATTACH-136] occupancy attach uses the issued managed-terminal session without a show query", async () => {
    const attached: string[] = [];
    const output: string[] = [];
    const frames: TerminalSessionFrame[] = [
      { kind: "ready", sessionId: "term_occupancy" },
      { kind: "output", stream: "stdout", data: "OpenCode ready\n" },
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
    const { createCliProgram } = await import("../src");
    const { IssueSandboxAgentAttachAccessCommand } = await import("@appaloft/application");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async <T>(_context: unknown, command: Command<T>) => {
          expect(command).toBeInstanceOf(IssueSandboxAgentAttachAccessCommand);
          return ok({
            workspaceId: "sbx_occupancy",
            runtimeId: "sar_occupancy",
            transport: "managed-terminal",
            sessionId: "term_occupancy",
            processId: "spr_occupancy",
            access: {
              kind: "websocket",
              path: "/api/terminal-sessions/term_occupancy/attach",
              expiresAt: "2026-08-17T09:00:00.000Z",
            },
          } as T);
        },
      } as unknown as CommandBus,
      queryBus: {
        execute: async <T>(_context: unknown, query: Query<T>) => {
          if (query.constructor.name.includes("ListSandboxAgentRuntimes")) {
            return ok({
              items: [
                {
                  runtimeId: "sar_occupancy",
                  interaction: { transport: "native-attach", serverPort: 4096 },
                },
              ],
            } as T);
          }
          throw new Error(`occupancy attach must not re-query ${query.constructor.name}`);
        },
      } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) =>
          createExecutionContext({ ...input, requestId: "req_occupancy_direct_terminal" }),
      },
      terminalSessionGateway: {
        attach: (sessionId) => {
          attached.push(sessionId);
          return ok(session);
        },
      },
      terminalIO: {
        stdin: {
          isTTY: false,
          on: () => {},
          removeListener: () => {},
        },
        stdout: { write: (data) => output.push(String(data)) },
        stderr: { write: () => {} },
      },
    });

    await program.parseAsync(["node", "appaloft", "workspace", "attach", "sbx_occupancy"]);
    expect(attached).toEqual(["term_occupancy"]);
    expect(output.join("")).toContain("OpenCode ready");
  });

  test("[WS-OCC-PREVIEW-001] occupancy preview falls back to the resource route when sandbox ports are unsupported", async () => {
    const output: string[] = [];
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async <T>(_context: unknown, command: Command<T>) => {
          if (command instanceof ExposeSandboxPortCommand) {
            return err(
              domainError.conflict("Sandbox provider does not support port publishing", {
                code: "sandbox_port_publishing_unsupported",
              }),
            );
          }
          throw new Error(`unexpected command ${command.constructor.name}`);
        },
      } as unknown as CommandBus,
      queryBus: {
        execute: async <T>(_context: unknown, query: Query<T>) => {
          if (query instanceof ShowSandboxQuery) {
            return ok({
              sandboxId: "sbx_occupancy",
              status: "ready",
              occupancy: {
                repositoryIdentity: "github.com/traefik/whoami",
                commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
                branch: "master",
              },
              activation: { project: { projectId: "prj_whoami" } },
            } as T);
          }
          if (query instanceof ListResourcesQuery) {
            return ok({
              items: [
                {
                  projectId: "prj_whoami",
                  slug: "app",
                  lastDeploymentId: "dep_preview",
                  lastDeploymentStatus: "succeeded",
                  accessSummary: {
                    latestGeneratedAccessRoute: {
                      url: "http://app-fxn4evc1sf.127.0.0.1.sslip.io",
                      deploymentStatus: "succeeded",
                    },
                  },
                },
              ],
            } as T);
          }
          throw new Error(`unexpected query ${query.constructor.name}`);
        },
      } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) => createExecutionContext({ ...input, requestId: "req_occupancy_preview" }),
      },
      terminalIO: {
        stdin: { isTTY: false, on: () => {}, removeListener: () => {} },
        stdout: { write: (data) => output.push(String(data)) },
        stderr: { write: () => {} },
      },
    });

    const write = process.stdout.write;
    process.stdout.write = ((data: string | Uint8Array) => {
      output.push(String(data));
      return true;
    }) as typeof process.stdout.write;
    try {
      await program.parseAsync([
        "node",
        "appaloft",
        "workspace",
        "preview",
        "sbx_occupancy",
        "--port",
        "80",
      ]);
    } finally {
      process.stdout.write = write;
    }
    const printed = output.join("");
    expect(printed).toContain('"kind": "occupancy-preview"');
    expect(printed).toContain("http://app-fxn4evc1sf.127.0.0.1.sslip.io");
    expect(printed).toContain("https://github.com/traefik/whoami/compare/master?expand=1");
  });
});

async function expectTtyCodeFirstChrome(args: readonly string[]): Promise<void> {
  const output: string[] = [];
  const inquireMessages: string[] = [];
  let presentationStarts = 0;
  let startedContext: WorkspaceControlPresentationContext | undefined;
  let doorResolved = false;
  const emptyDir = await mkdtemp(join(tmpdir(), "appaloft-code-inquire-"));
  const folderName = folderDirectoryName(emptyDir);
  const previousCwd = process.cwd();
  process.chdir(emptyDir);
  const { createCliProgram } = await import("../src");
  const program = createCliProgram({
    version: "0.1.0-test",
    startServer: async () => {},
    commandBus: {
      execute: async <T>(_context: unknown, command: Command<T>) => {
        if (command instanceof CreateProjectCommand) {
          return ok({ id: "prj_code_tui", name: folderName } as T);
        }
        return ok({} as T);
      },
    } as unknown as CommandBus,
    queryBus: { execute: async () => ok({ items: [] }) } as unknown as QueryBus,
    executionContextFactory: {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: `req_code_tui_${args.join("_") || "code"}`,
        }),
    },
    terminalIO: {
      stdin: { isTTY: true, on: () => undefined },
      stdout: {
        isTTY: true,
        write: (chunk: string | Uint8Array) => {
          output.push(String(chunk));
          return true;
        },
      },
      stderr: {
        isTTY: true,
        write: (chunk: string | Uint8Array) => {
          output.push(String(chunk));
          return true;
        },
      },
    },
    environment: {
      HOME: emptyDir,
      PATH: "/usr/bin",
      TERM: "xterm-256color",
    },
    folderOnboardingInteraction: {
      text: () => {
        throw new Error("code session must not collect free text");
      },
      select: () => {
        throw new Error("code session must not select a project inside TUI");
      },
      confirm: (input) => {
        inquireMessages.push(input.message);
        throw new Error("code TUI must auto-create instead of inquiring");
      },
    },
    workspaceControlPresentation: {
      start: async (context) => {
        expect(inquireMessages).toEqual([]);
        presentationStarts += 1;
        startedContext = context;
      },
    },
    resolveRemoteCodeDoor: async () => {
      doorResolved = true;
      throw new Error("TTY code should occupy only after the TUI starts");
    },
  });
  const write = process.stdout.write;
  process.stdout.write = ((chunk) => {
    output.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    await program.parseAsync(["node", "appaloft", ...args]);
  } finally {
    process.stdout.write = write;
    process.chdir(previousCwd);
    await rm(emptyDir, { recursive: true, force: true });
  }
  const printed = output.join("");
  expect(inquireMessages).toEqual([]);
  expect(presentationStarts).toBe(1);
  expect(startedContext?.occupyBootstrap).toBeTypeOf("function");
  expect(startedContext?.occupancyChrome?.project).toBe(folderName);
  expect(doorResolved).toBeFalse();
  expect(printed).not.toContain("Checking login…");
  expect(printed).not.toContain("Opening occupancy");
  expect(printed).not.toContain("Opening remote session…");
  expect(printed).not.toMatch(/occupancy/iu);
  expect(printed).not.toContain("Select a Workspace to load bounded detail.");
  expect(printed).not.toContain("Connecting to Appaloft");

  const renderer = {
    messages: [] as Array<Record<string, unknown>>,
    send(message: Record<string, unknown>) {
      this.messages.push(message);
      return Promise.resolve();
    },
    async *events() {
      yield { type: "quit" as const };
    },
    close: () => Promise.resolve(),
  };
  const presentation = createBoundedWorkspaceControlPresentation({
    openRenderer: async () => renderer as never,
  });
  await presentation.start({
    occupyBootstrap: async () => undefined,
    occupancyChrome: startedContext?.occupancyChrome,
    executeCommand: async () => ok({}),
    executeQuery: async <T>() => ok({ items: [] } as T),
  });
  expect(renderer.messages[0]).toEqual({
    type: "loading",
    collapsed: true,
    title: OCCUPANCY_CODE_CHROME_TITLE,
    project: folderName,
  });
  expect(JSON.stringify(renderer.messages)).not.toMatch(/occupancy/iu);
  expect(JSON.stringify(renderer.messages)).not.toContain(
    "Select a Workspace to load bounded detail.",
  );
}

function createCliFolderOccupancyOpen(options: {
  readonly executedCommands: string[][];
  readonly preferred?: {
    readonly workspaceId: string;
    readonly commitSha: string;
    readonly profileInstallationId: string;
    readonly status: "partial" | "ready" | "terminal";
    readonly phase?: string;
    readonly repositoryIdentity?: string;
    readonly targetSelection: {
      readonly targetClass: "managed" | "registered-server";
      readonly source: "platform-default" | "explicit";
      readonly reason: string;
    };
  };
}): { readonly service: AgentWorkspaceOpenService } {
  const pin = {
    profileInstallationId: "awpi_default",
    profileDefinitionDigest: `sha256:${"a".repeat(64)}`,
    profileId: "custom-default",
    profileVersion: "1.0.0",
    adapterInstallationId: "aai_custom",
    adapterDefinitionDigest: `sha256:${"b".repeat(64)}`,
    adapterId: "custom-agent",
    adapterVersion: "1.0.0",
    harnessKey: "custom-agent",
    harnessTemplateId: "aht_custom",
    sandboxTemplateId: "sbt_agent",
    sandboxTemplateVersion: "1",
    sandboxTemplateDigest: `sha256:${"c".repeat(64)}`,
    capabilities: {
      taskMode: true,
      interactive: true,
      backgroundRuns: true,
      nativeSession: false,
      persistentPaths: ["/workspace"],
    },
  };
  const activation = {
    project: { projectId: "prj_7fky4yjn1l1c", disposition: "created" as const },
    repositoryBinding: { bindingId: "rbd_notes", disposition: "created" as const },
    profile: { profileInstallationId: "awpi_default", disposition: "created" as const },
  };
  return {
    service: new AgentWorkspaceOpenService({
      preflight: {
        resolveContext: async () =>
          ok({
            projectId: "prj_7fky4yjn1l1c",
            profileInstallationId: "awpi_default",
            activation,
          }),
        admit: async (_context, resolved) =>
          ok({
            projectId: resolved.projectId,
            profileInstallationId: resolved.profileInstallationId,
            activation: resolved.activation,
            plan: {
              sandbox: {
                source: { kind: "template", templateId: "sbt_agent" },
                requestedIsolation: "gvisor",
                limits: {
                  cpuMillis: 1_000,
                  memoryBytes: 536_870_912,
                  diskBytes: 2_147_483_648,
                  maxProcesses: 32,
                },
                networkPolicy: { mode: "allowlist", rules: [] },
              },
              initialization: [],
              runtime: {
                harnessKey: "custom-agent",
                harnessTemplateId: "aht_custom",
                declarativeHarness: {},
              },
              defaultPorts: [],
              suggestedChecks: [],
              credentialRequirements: [],
              pin,
            },
            reservation: {
              reservationId: "res_notes",
              targetSelection: options.preferred?.targetSelection ?? {
                targetClass: "registered-server",
                source: "explicit",
                reason: "code_target_server",
              },
            },
          }),
      },
      entries: {
        findByWorkspaceIds: async () => new Map(),
        findByWorkspaceId: async () => undefined,
        findPreferred: async () => options.preferred,
        findLiveProfileInstallationIds: async () => [],
        begin: async () => ok({ workspaceId: "sbx_notes", created: true }),
        complete: async () => ok(undefined),
        fail: async () => ok(undefined),
        markWorkspaceTerminated: async () => ok({ advanced: true }),
      },
      sourceCredentials: {
        resolve: async () => {
          throw new Error("folder.local occupy must not resolve source credentials");
        },
      },
      sandboxes: {
        create: async () => ok({ sandboxId: "sbx_notes", status: "ready" }),
        resume: async (_context, workspaceId) => ok({ sandboxId: workspaceId, status: "ready" }),
        exec: async (_context, _workspaceId, command) => {
          options.executedCommands.push([...command.argv]);
          return ok({ mode: "foreground", frames: [{ kind: "exit", exitCode: 1 }] });
        },
        exposePort: async () => ok(undefined),
      },
      agents: {
        showRuntime: async (_context, value) =>
          ok({
            runtimeId: value.runtimeId,
            sandboxId: value.sandboxId,
            harnessKey: "custom-agent",
            harnessTemplateId: "aht_custom",
            status: "ready",
            profilePin: pin,
            capabilities: pin.capabilities,
            createdAt: "2026-08-20T00:00:00.000Z",
          }),
        createRuntime: async (_context, value) =>
          ok({
            runtimeId: value.sandboxId === "sbx_partial" ? "sar_partial" : "sar_notes",
            sandboxId: value.sandboxId,
            harnessKey: "custom-agent",
            harnessTemplateId: "aht_custom",
            status: "ready",
            capabilities: pin.capabilities,
            createdAt: "2026-08-20T00:00:00.000Z",
          }),
        ensureRuntime: async () => ok(undefined),
        attach: async () => {
          throw new Error("attach should not run");
        },
      },
      reservations: {
        consume: async () => ok(undefined),
        release: async () => ok(undefined),
      },
      now: () => "2026-08-20T00:00:00.000Z",
    }),
  };
}
