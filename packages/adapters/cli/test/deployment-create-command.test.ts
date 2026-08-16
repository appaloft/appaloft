import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type Command as AppCommand,
  type Query as AppQuery,
  type CommandBus,
  CreateDeploymentCommand,
  createExecutionContext,
  type ExecutionContextFactory,
  ListEnvironmentsQuery,
  ListResourcesQuery,
  ListServersQuery,
  type QueryBus,
  ShowRepositoryBindingQuery,
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

  test("[WS-REMOTE-DEPLOY-053] deploy git-remote without occupancy Resource stays on existing path", async () => {
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "dep_unexpected" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        if (query.constructor.name === "ShowRepositoryBindingQuery") {
          return ok({
            bindingId: "bnd_unbound",
            repositoryIdentity: "github.com/octocat/Hello-World",
            projectId: "prj_empty",
            status: "unbound",
            createdAt: "2026-08-16T00:00:00.000Z",
          } as T);
        }
        return ok({ items: [] } as T);
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
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      process.stderr.write = (() => true) as typeof process.stderr.write;
      await expect(
        program.parseAsync([
          "node",
          "appaloft",
          "deploy",
          "https://github.com/octocat/Hello-World.git",
        ]),
      ).rejects.toBeDefined();
    } finally {
      process.stdout.write = writeStdout;
      process.stderr.write = writeStderr;
      process.exitCode = exitCode ?? 0;
    }
    expect(commands).toHaveLength(0);
  });
});
