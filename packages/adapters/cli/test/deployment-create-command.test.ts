import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type Command as AppCommand,
  type Query as AppQuery,
  type CommandBus,
  CreateDeploymentCommand,
  CreateResourceCommand,
  createExecutionContext,
  type ExecutionContextFactory,
  type QueryBus,
} from "@appaloft/application";
import { ok } from "@appaloft/core";

describe("CLI deployment create command", () => {
  test("[DEP-CREATE-ENTRY-009] local deployments create progresses synchronously", async () => {
    const commands: AppCommand<unknown>[] = [];
    let workerStarts = 0;
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "dep_remote" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) =>
        ok({
          items: [
            {
              id: "dep_remote",
              resourceId: "res_api",
              status: "succeeded",
            },
          ],
        } as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_deployment_create_test",
        }),
    };
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      startWorkerRuntime: async () => {
        workerStarts += 1;
      },
      commandBus,
      queryBus,
      executionContextFactory,
    });

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync([
        "node",
        "appaloft",
        "deployments",
        "create",
        "--project",
        "prj_remote",
        "--environment",
        "env_production",
        "--resource",
        "res_api",
        "--server",
        "srv_production",
        "--destination",
        "dst_default",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(CreateDeploymentCommand);
    expect(commands[0]).toMatchObject({
      projectId: "prj_remote",
      environmentId: "env_production",
      resourceId: "res_api",
      serverId: "srv_production",
      destinationId: "dst_default",
      executionMode: "synchronous",
    });
    expect(workerStarts).toBe(1);

    const writeStderr = process.stderr.write;
    const exitCode = process.exitCode;
    try {
      process.stderr.write = (() => true) as typeof process.stderr.write;
      await expect(
        program.parseAsync([
          "node",
          "appaloft",
          "deployments",
          "create",
          "--project",
          "prj_remote",
          "--environment",
          "env_production",
          "--resource",
          "res_api",
          "--server",
          "srv_production",
          "--destination",
          "",
        ]),
      ).rejects.toBeDefined();
    } finally {
      process.stderr.write = writeStderr;
      process.exitCode = exitCode ?? 0;
    }
    expect(commands).toHaveLength(1);
  });

  test("[WS-REMOTE-DEPLOY-052] deploy git-remote reuses occupancy Resource app", async () => {
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "dep_occupancy" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        switch (query.constructor.name) {
          case "ShowRepositoryBindingQuery":
            return ok({
              bindingId: "bnd_examples",
              repositoryIdentity: "github.com/appaloft/examples",
              projectId: "prj_ypciz6srxa08",
              status: "active",
              createdAt: "2026-08-16T00:00:00.000Z",
            } as T);
          case "ListEnvironmentsQuery":
            return ok({
              items: [{ id: "env_19uqxjunq5za", projectId: "prj_ypciz6srxa08", name: "local" }],
            } as T);
          case "ListResourcesQuery":
            return ok({
              items: [
                {
                  id: "res_3qjkhtnc45nk",
                  projectId: "prj_ypciz6srxa08",
                  environmentId: "env_19uqxjunq5za",
                  slug: "app",
                },
              ],
            } as T);
          case "ListServersQuery":
            return ok({
              items: [
                {
                  id: "srv_uil9cpctplou",
                  name: "occupancy-mac",
                  lifecycleStatus: "active",
                },
              ],
            } as T);
          default:
            return ok({
              items: [{ id: "dep_occupancy", resourceId: "res_3qjkhtnc45nk", status: "succeeded" }],
            } as T);
        }
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_occupancy_deploy_reuse",
        }),
    };
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      startWorkerRuntime: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync([
        "node",
        "appaloft",
        "deploy",
        "https://github.com/appaloft/examples.git",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(CreateDeploymentCommand);
    expect(commands[0]).toMatchObject({
      projectId: "prj_ypciz6srxa08",
      environmentId: "env_19uqxjunq5za",
      resourceId: "res_3qjkhtnc45nk",
      serverId: "srv_uil9cpctplou",
    });
  });

  test("[WS-REMOTE-DEPLOY-053] deploy git-remote without occupancy creates a new app", async () => {
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        const name = command.constructor.name;
        if (name === "CreateProjectCommand") return ok({ id: "prj_new_hello" } as T);
        if (name === "CreateEnvironmentCommand") return ok({ id: "env_new_hello" } as T);
        if (name === "CreateResourceCommand") return ok({ id: "res_new_hello" } as T);
        if (command instanceof CreateDeploymentCommand) return ok({ id: "dep_new_hello" } as T);
        return ok({ id: `id_${commands.length}` } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        switch (query.constructor.name) {
          case "ShowRepositoryBindingQuery":
            return ok({
              bindingId: "bnd_unbound",
              repositoryIdentity: "github.com/octocat/Hello-World",
              projectId: "prj_empty",
              status: "unbound",
              createdAt: "2026-08-16T00:00:00.000Z",
            } as T);
          case "ListServersQuery":
            return ok({
              items: [
                {
                  id: "srv_4lifk0yrcecy",
                  name: "hostinger",
                  lifecycleStatus: "active",
                },
              ],
            } as T);
          case "ShowDeploymentQuery":
            return ok({
              schemaVersion: "deployments.show/v1",
              deployment: {
                id: "dep_new_hello",
                resourceId: "res_new_hello",
                status: "succeeded",
              },
            } as T);
          default:
            return ok({ items: [] } as T);
        }
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_occupancy_deploy_missing",
        }),
    };
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      startWorkerRuntime: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
      terminalIO: {
        stdin: { isTTY: false, on: () => undefined },
        stdout: { isTTY: false, write: () => true },
        stderr: { isTTY: false, write: () => true },
      },
    });
    const writeStdout = process.stdout.write;
    const writeStderr = process.stderr.write;
    const exitCode = process.exitCode;
    let errorText = "";
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      process.stderr.write = (() => true) as typeof process.stderr.write;
      await program
        .parseAsync(["node", "appaloft", "deploy", "https://github.com/octocat/Hello-World.git"])
        .catch((error: unknown) => {
          errorText =
            error instanceof Error ? `${error.message}\n${JSON.stringify(error)}` : String(error);
        });
    } finally {
      process.stdout.write = writeStdout;
      process.stderr.write = writeStderr;
      process.exitCode = exitCode ?? 0;
    }
    expect(errorText).not.toContain("Run appaloft code");
    expect(errorText).not.toContain("workspace_occupancy_resource_missing");
    expect(errorText).not.toContain("Occupancy Resource app is required");
    const occupancyDeploys = commands.filter(
      (command) =>
        command instanceof CreateDeploymentCommand && command.resourceId === "res_dfsc156jw98k",
    );
    expect(occupancyDeploys).toHaveLength(0);
    expect(commands.some((command) => command instanceof CreateDeploymentCommand)).toBe(true);
  });

  test("[WS-REMOTE-DEPLOY-057] bare deploy does not silently reuse a whoami occupancy", async () => {
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "dep_bare" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        switch (query.constructor.name) {
          case "ListSandboxesQuery":
            return ok({
              items: [
                {
                  sandboxId: "sbx_old",
                  status: "ready",
                  lastActivityAt: "2026-08-16T07:00:00.000Z",
                  occupancy: {
                    repositoryIdentity: "github.com/appaloft/examples",
                    commitSha: "a".repeat(40),
                    branch: "main",
                  },
                },
                {
                  sandboxId: "sbx_whoami",
                  status: "ready",
                  lastActivityAt: "2026-08-16T08:00:00.000Z",
                  occupancy: {
                    repositoryIdentity: "github.com/traefik/whoami",
                    commitSha: "b".repeat(40),
                    branch: "master",
                  },
                },
              ],
            } as T);
          case "ShowRepositoryBindingQuery":
            return ok({
              bindingId: "bnd_whoami",
              repositoryIdentity: "github.com/traefik/whoami",
              projectId: "prj_tk5lovqu2vj8",
              status: "active",
              createdAt: "2026-08-16T00:00:00.000Z",
            } as T);
          case "ListEnvironmentsQuery":
            return ok({
              items: [{ id: "env_8moaj3z5e7s9", projectId: "prj_tk5lovqu2vj8", name: "local" }],
            } as T);
          case "ListResourcesQuery":
            return ok({
              items: [
                {
                  id: "res_dfsc156jw98k",
                  projectId: "prj_tk5lovqu2vj8",
                  environmentId: "env_8moaj3z5e7s9",
                  slug: "app",
                },
              ],
            } as T);
          case "ListServersQuery":
            return ok({
              items: [
                {
                  id: "srv_uil9cpctplou",
                  name: "occupancy-mac",
                  lifecycleStatus: "active",
                },
              ],
            } as T);
          default:
            return ok({
              items: [{ id: "dep_bare", resourceId: "res_dfsc156jw98k", status: "succeeded" }],
            } as T);
        }
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_bare_occupancy_deploy",
        }),
    };
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      startWorkerRuntime: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
      terminalIO: {
        stdin: { isTTY: false, on: () => undefined },
        stdout: { isTTY: false, write: () => true },
        stderr: { isTTY: false, write: () => true },
      },
    });

    const queried: string[] = [];
    const originalExecute = queryBus.execute.bind(queryBus);
    queryBus.execute = async (context, query) => {
      queried.push(query.constructor.name);
      return originalExecute(context, query);
    };
    const writeStdout = process.stdout.write;
    const writeStderr = process.stderr.write;
    const exitCode = process.exitCode;
    let rejected = false;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      process.stderr.write = (() => true) as typeof process.stderr.write;
      await program.parseAsync(["node", "appaloft", "deploy"]).catch(() => {
        rejected = true;
      });
    } finally {
      process.stdout.write = writeStdout;
      process.stderr.write = writeStderr;
      process.exitCode = exitCode ?? 0;
    }

    expect(queried).not.toContain("ListSandboxesQuery");
    const occupancyDeploys = commands.filter(
      (command) =>
        command instanceof CreateDeploymentCommand && command.resourceId === "res_dfsc156jw98k",
    );
    expect(occupancyDeploys).toHaveLength(0);
    if (commands.some((command) => command instanceof CreateDeploymentCommand)) {
      expect(commands[0]).not.toMatchObject({
        projectId: "prj_tk5lovqu2vj8",
        resourceId: "res_dfsc156jw98k",
      });
    } else {
      expect(rejected).toBe(true);
    }
  });

  test("[WS-REMOTE-DEPLOY-058] bare deploy without occupancy uses cwd instead of occupancy fail-closed", async () => {
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "dep_unexpected" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        if (query.constructor.name === "ListDeploymentsQuery") {
          return ok({
            items: [
              {
                id: "dep_unexpected",
                resourceId: "res_cwd",
                status: "succeeded",
              },
            ],
          } as T);
        }
        return ok({ items: [] } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_bare_occupancy_missing",
        }),
    };
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      startWorkerRuntime: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
      terminalIO: {
        stdin: { isTTY: false, on: () => undefined },
        stdout: { isTTY: false, write: () => true },
        stderr: { isTTY: false, write: () => true },
      },
    });
    const queried: string[] = [];
    const originalExecute = queryBus.execute.bind(queryBus);
    queryBus.execute = async (context, query) => {
      queried.push(query.constructor.name);
      return originalExecute(context, query);
    };
    const writeStdout = process.stdout.write;
    const writeStderr = process.stderr.write;
    const exitCode = process.exitCode;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      process.stderr.write = (() => true) as typeof process.stderr.write;
      await program.parseAsync(["node", "appaloft", "deploy"]).catch(() => undefined);
    } finally {
      process.stdout.write = writeStdout;
      process.stderr.write = writeStderr;
      process.exitCode = exitCode ?? 0;
    }
    expect(queried).not.toContain("ListSandboxesQuery");
  });

  test("[WS-REMOTE-DEPLOY-059] occupancy deploy prints generated access URL", async () => {
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "dep_url" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        switch (query.constructor.name) {
          case "ListSandboxesQuery":
            return ok({
              items: [
                {
                  sandboxId: "sbx_whoami",
                  status: "ready",
                  lastActivityAt: "2026-08-16T08:00:00.000Z",
                  occupancy: {
                    repositoryIdentity: "github.com/traefik/whoami",
                    commitSha: "b".repeat(40),
                    branch: "master",
                  },
                },
              ],
            } as T);
          case "ShowRepositoryBindingQuery":
            return ok({
              bindingId: "bnd_whoami",
              repositoryIdentity: "github.com/traefik/whoami",
              projectId: "prj_tk5lovqu2vj8",
              status: "active",
              createdAt: "2026-08-16T00:00:00.000Z",
            } as T);
          case "ListEnvironmentsQuery":
            return ok({
              items: [{ id: "env_8moaj3z5e7s9", projectId: "prj_tk5lovqu2vj8", name: "local" }],
            } as T);
          case "ListResourcesQuery":
            return ok({
              items: [
                {
                  id: "res_dfsc156jw98k",
                  projectId: "prj_tk5lovqu2vj8",
                  environmentId: "env_8moaj3z5e7s9",
                  slug: "app",
                },
              ],
            } as T);
          case "ListServersQuery":
            return ok({
              items: [{ id: "srv_uil9cpctplou", name: "occupancy-mac", lifecycleStatus: "active" }],
            } as T);
          case "ShowDeploymentQuery":
            return ok({
              schemaVersion: "deployments.show/v1",
              deployment: {
                id: "dep_url",
                resourceId: "res_dfsc156jw98k",
                status: "succeeded",
                runtimePlan: {
                  execution: {
                    accessRoutes: [
                      {
                        domains: ["app-sc156jw98k.127.0.0.1.sslip.io"],
                        pathPrefix: "/",
                        tlsMode: "disabled",
                      },
                    ],
                  },
                },
              },
            } as T);
          default:
            return ok({
              items: [{ id: "dep_url", resourceId: "res_dfsc156jw98k", status: "succeeded" }],
            } as T);
        }
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_occupancy_deploy_url",
        }),
    };
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      executionTarget: "remote",
      startServer: async () => {},
      startWorkerRuntime: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
      terminalIO: {
        stdin: { isTTY: false, on: () => undefined },
        stdout: { isTTY: false, write: () => true },
        stderr: { isTTY: false, write: () => true },
      },
    });
    const chunks: string[] = [];
    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = ((chunk: string | Uint8Array) => {
        chunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
        return true;
      }) as typeof process.stdout.write;
      await program.parseAsync([
        "node",
        "appaloft",
        "deploy",
        "https://github.com/traefik/whoami.git",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }
    expect(commands).toHaveLength(1);
    expect(chunks.join("")).toContain("http://app-sc156jw98k.127.0.0.1.sslip.io");
  });

  test("[WS-REMOTE-DEPLOY-060] missing generated URL stays omitted", async () => {
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "dep_nourl" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        switch (query.constructor.name) {
          case "ListSandboxesQuery":
            return ok({
              items: [
                {
                  sandboxId: "sbx_whoami",
                  status: "ready",
                  lastActivityAt: "2026-08-16T08:00:00.000Z",
                  occupancy: {
                    repositoryIdentity: "github.com/traefik/whoami",
                    commitSha: "b".repeat(40),
                    branch: "master",
                  },
                },
              ],
            } as T);
          case "ShowRepositoryBindingQuery":
            return ok({
              bindingId: "bnd_whoami",
              repositoryIdentity: "github.com/traefik/whoami",
              projectId: "prj_tk5lovqu2vj8",
              status: "active",
              createdAt: "2026-08-16T00:00:00.000Z",
            } as T);
          case "ListEnvironmentsQuery":
            return ok({
              items: [{ id: "env_8moaj3z5e7s9", projectId: "prj_tk5lovqu2vj8", name: "local" }],
            } as T);
          case "ListResourcesQuery":
            return ok({
              items: [
                {
                  id: "res_dfsc156jw98k",
                  projectId: "prj_tk5lovqu2vj8",
                  environmentId: "env_8moaj3z5e7s9",
                  slug: "app",
                },
              ],
            } as T);
          case "ListServersQuery":
            return ok({
              items: [{ id: "srv_uil9cpctplou", name: "occupancy-mac", lifecycleStatus: "active" }],
            } as T);
          default:
            return ok({
              items: [{ id: "dep_nourl", resourceId: "res_dfsc156jw98k", status: "succeeded" }],
            } as T);
        }
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_occupancy_deploy_nourl",
        }),
    };
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      startWorkerRuntime: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
      terminalIO: {
        stdin: { isTTY: false, on: () => undefined },
        stdout: { isTTY: false, write: () => true },
        stderr: { isTTY: false, write: () => true },
      },
    });
    const chunks: string[] = [];
    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = ((chunk: string | Uint8Array) => {
        chunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
        return true;
      }) as typeof process.stdout.write;
      await program.parseAsync([
        "node",
        "appaloft",
        "deploy",
        "https://github.com/traefik/whoami.git",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }
    const stdout = chunks.join("");
    expect(commands).toHaveLength(1);
    expect(stdout).toContain("dep_nourl");
    expect(stdout).not.toContain("sslip.io");
    expect(stdout).not.toContain('"url"');
  });

  test("[DEP-CREATE-ENTRY-010] remote deploy waits for terminal failure and does not celebrate a URL", async () => {
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "dep_aj0as1thikd0" } as T);
      },
    } as unknown as CommandBus;
    const failedUrl = "http://appaloft-nux-hello-hhk22b-h7q6y0zq0t.2.25.182.56.sslip.io";
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        switch (query.constructor.name) {
          case "ShowRepositoryBindingQuery":
            return ok({
              bindingId: "bnd_site",
              repositoryIdentity: "github.com/acme/nux-hello",
              projectId: "prj_site",
              status: "active",
              createdAt: "2026-08-19T00:00:00.000Z",
            } as T);
          case "ListEnvironmentsQuery":
            return ok({
              items: [{ id: "env_site", projectId: "prj_site", name: "local" }],
            } as T);
          case "ListResourcesQuery":
            return ok({
              items: [
                {
                  id: "res_site",
                  projectId: "prj_site",
                  environmentId: "env_site",
                  slug: "app",
                },
              ],
            } as T);
          case "ListServersQuery":
            return ok({
              items: [{ id: "srv_4lifk0yrcecy", name: "hostinger", lifecycleStatus: "active" }],
            } as T);
          case "ShowDeploymentQuery":
            return ok({
              schemaVersion: "deployments.show/v1",
              latestFailure: {
                timestamp: "2026-08-19T11:01:54.000Z",
                source: "ssh",
                phase: "package",
                level: "error",
                message: 'SSH Docker image build failed: #5 ERROR: "/public": not found',
              },
              deployment: {
                id: "dep_aj0as1thikd0",
                resourceId: "res_site",
                status: "failed",
                runtimePlan: {
                  execution: {
                    accessRoutes: [
                      {
                        domains: ["appaloft-nux-hello-hhk22b-h7q6y0zq0t.2.25.182.56.sslip.io"],
                        pathPrefix: "/",
                        tlsMode: "disabled",
                      },
                    ],
                  },
                },
              },
            } as T);
          default:
            return ok({
              items: [
                {
                  id: "dep_aj0as1thikd0",
                  resourceId: "res_site",
                  status: "failed",
                  timeline: [
                    {
                      timestamp: "2026-08-19T11:01:54.000Z",
                      source: "docker",
                      phase: "package",
                      level: "error",
                      message: '#5 ERROR: "/public": not found',
                    },
                    {
                      timestamp: "2026-08-19T11:01:55.000Z",
                      source: "ssh",
                      phase: "package",
                      level: "error",
                      message: 'SSH Docker image build failed: #5 ERROR: "/public": not found',
                    },
                  ],
                },
              ],
            } as T);
        }
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_remote_deploy_failed",
        }),
    };
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      executionTarget: "remote",
      startServer: async () => {},
      startWorkerRuntime: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
      terminalIO: {
        stdin: { isTTY: false, on: () => undefined },
        stdout: { isTTY: false, write: () => true },
        stderr: { isTTY: false, write: () => true },
      },
    });
    const chunks: string[] = [];
    const writeStdout = process.stdout.write;
    const writeStderr = process.stderr.write;
    const exitCode = process.exitCode;
    let error: unknown;
    try {
      process.stdout.write = ((chunk: string | Uint8Array) => {
        chunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
        return true;
      }) as typeof process.stdout.write;
      process.stderr.write = (() => true) as typeof process.stderr.write;
      await program
        .parseAsync(["node", "appaloft", "deploy", "https://github.com/acme/nux-hello.git"])
        .then(
          () => undefined,
          (caught: unknown) => {
            error = caught;
          },
        );
    } finally {
      process.stdout.write = writeStdout;
      process.stderr.write = writeStderr;
      process.exitCode = exitCode ?? 0;
    }

    expect(commands).toHaveLength(1);
    expect(error).toBeDefined();
    const errorText =
      error instanceof Error ? `${error.message}\n${JSON.stringify(error)}` : JSON.stringify(error);
    expect(errorText).toContain("SSH Docker image build failed");
    expect(errorText).toContain("/public");
    expect(errorText).toContain("not found");
    expect(errorText).toContain("ssh_docker_build_failed");
    expect(errorText).toContain("deployment_failed");
    expect(chunks.join("")).not.toContain(failedUrl);
    expect(chunks.join("")).not.toContain('"url"');
  });

  test("[QUICK-DEPLOY-ENTRY-008A] deploy . / --as static-site / --publish-dir . omit dot publishDirectory on the wire", async () => {
    const leftoverOccupancyResourceId = "res_dfsc156jw98k";
    const cases = [
      ["node", "appaloft", "deploy", ".", "--as", "static-site"],
      ["node", "appaloft", "deploy", ".", "--method", "static", "--publish-dir", "."],
    ] as const;

    for (const argv of cases) {
      const commands: AppCommand<unknown>[] = [];
      const commandBus = {
        execute: async <T>(_context: unknown, command: AppCommand<T>) => {
          commands.push(command as AppCommand<unknown>);
          const name = command.constructor.name;
          if (name === "CreateResourceCommand") return ok({ id: "res_static_root" } as T);
          if (command instanceof CreateDeploymentCommand) return ok({ id: "dep_static_root" } as T);
          return ok({ id: `id_${commands.length}` } as T);
        },
      } as unknown as CommandBus;
      const queryBus = {
        execute: async <T>(_context: unknown, query: AppQuery<T>) => {
          switch (query.constructor.name) {
            case "ListServersQuery":
              return ok({
                items: [
                  {
                    id: "srv_4lifk0yrcecy",
                    name: "hostinger",
                    lifecycleStatus: "active",
                  },
                ],
              } as T);
            case "ShowDeploymentQuery":
              return ok({
                schemaVersion: "deployments.show/v1",
                deployment: {
                  id: "dep_static_root",
                  resourceId: "res_static_root",
                  status: "succeeded",
                },
              } as T);
            default:
              return ok({ items: [] } as T);
          }
        },
      } as unknown as QueryBus;
      const { createCliProgram } = await import("../src");
      const program = createCliProgram({
        version: "0.1.0-test",
        startServer: async () => {},
        startWorkerRuntime: async () => {},
        commandBus,
        queryBus,
        executionContextFactory: {
          create: (input) =>
            createExecutionContext({
              ...input,
              requestId: "req_cli_static_publish_dir_wire",
            }),
        },
        terminalIO: {
          stdin: { isTTY: false, on: () => undefined },
          stdout: { isTTY: false, write: () => true },
          stderr: { isTTY: false, write: () => true },
        },
      });

      const writeStdout = process.stdout.write;
      const writeStderr = process.stderr.write;
      const exitCode = process.exitCode;
      try {
        process.stdout.write = (() => true) as typeof process.stdout.write;
        process.stderr.write = (() => true) as typeof process.stderr.write;
        await program.parseAsync([
          ...argv,
          "--project",
          "prj_static",
          "--environment",
          "env_static",
          "--server",
          "srv_4lifk0yrcecy",
        ]);
      } finally {
        process.stdout.write = writeStdout;
        process.stderr.write = writeStderr;
        process.exitCode = exitCode ?? 0;
      }

      const created = commands.find((command) => command instanceof CreateResourceCommand);
      expect(created).toBeDefined();
      expect(created).toMatchObject({
        projectId: "prj_static",
        environmentId: "env_static",
        kind: "static-site",
        runtimeProfile: {
          strategy: "static",
          publishDirectory: "/",
        },
      });
      const wireBody = JSON.stringify(created);
      expect(JSON.parse(wireBody).runtimeProfile.publishDirectory).toBe("/");
      expect(wireBody).not.toMatch(/"publishDirectory"\s*:\s*"\.+"/);
      const occupancyDeploys = commands.filter(
        (command) =>
          command instanceof CreateDeploymentCommand &&
          command.resourceId === leftoverOccupancyResourceId,
      );
      expect(occupancyDeploys).toHaveLength(0);
      expect(commands.some((command) => command instanceof CreateDeploymentCommand)).toBe(true);
    }
  });
});
