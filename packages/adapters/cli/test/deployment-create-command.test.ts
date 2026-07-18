import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type Command as AppCommand,
  type Query as AppQuery,
  type CommandBus,
  CreateDeploymentCommand,
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
});
