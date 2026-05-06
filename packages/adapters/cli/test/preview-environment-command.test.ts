import { describe, expect, test } from "bun:test";
import {
  type Command as AppCommand,
  type Query as AppQuery,
  type CommandBus,
  type ExecutionContextFactory,
  type QueryBus,
} from "@appaloft/application";
import { ok } from "@appaloft/core";

function ensureReflectMetadata(): void {
  const reflectObject = Reflect as typeof Reflect & {
    defineMetadata?: (...args: unknown[]) => void;
    getMetadata?: (...args: unknown[]) => unknown;
    getOwnMetadata?: (...args: unknown[]) => unknown;
    hasMetadata?: (...args: unknown[]) => boolean;
    metadata?: (_metadataKey: unknown, _metadataValue: unknown) => ClassDecorator;
  };

  reflectObject.defineMetadata ??= () => {};
  reflectObject.getMetadata ??= () => undefined;
  reflectObject.getOwnMetadata ??= () => undefined;
  reflectObject.hasMetadata ??= () => false;
  reflectObject.metadata ??= () => () => {};
}

function previewEnvironmentSummary() {
  return {
    previewEnvironmentId: "prenv_cli",
    projectId: "prj_demo",
    environmentId: "env_preview",
    resourceId: "res_api",
    serverId: "srv_demo",
    destinationId: "dst_web",
    source: {
      provider: "github" as const,
      repositoryFullName: "appaloft/demo",
      headRepositoryFullName: "appaloft/demo",
      pullRequestNumber: 42,
      baseRef: "main",
      headSha: "abc1234",
      sourceBindingFingerprint: "srcfp_pr_42",
    },
    status: "active" as const,
    createdAt: "2026-05-06T01:00:00.000Z",
    updatedAt: "2026-05-06T01:01:00.000Z",
  };
}

describe("CLI preview environment commands", () => {
  test("[PG-PREVIEW-SURFACE-001] preview environment list dispatches the application query", async () => {
    ensureReflectMetadata();
    const { ListPreviewEnvironmentsQuery, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const commandBus = {
      execute: async <T>(_context: unknown, _command: AppCommand<T>) => ok({} as T),
    } as unknown as CommandBus;
    const queries: AppQuery<unknown>[] = [];
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        return ok({
          schemaVersion: "preview-environments.list/v1",
          items: [previewEnvironmentSummary()],
          generatedAt: "2026-05-06T04:00:00.000Z",
        } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_preview_environment_list_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
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
        "preview",
        "environment",
        "list",
        "--project",
        "prj_demo",
        "--resource",
        "res_api",
        "--status",
        "active",
        "--repository",
        "appaloft/demo",
        "--pull-request-number",
        "42",
        "--limit",
        "10",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(ListPreviewEnvironmentsQuery);
    expect(queries[0]).toMatchObject({
      projectId: "prj_demo",
      resourceId: "res_api",
      status: "active",
      repositoryFullName: "appaloft/demo",
      pullRequestNumber: 42,
      limit: 10,
    });
  });

  test("[PG-PREVIEW-SURFACE-001] preview environment show dispatches the application query", async () => {
    ensureReflectMetadata();
    const { ShowPreviewEnvironmentQuery, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const commandBus = {
      execute: async <T>(_context: unknown, _command: AppCommand<T>) => ok({} as T),
    } as unknown as CommandBus;
    const queries: AppQuery<unknown>[] = [];
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        return ok({
          schemaVersion: "preview-environments.show/v1",
          previewEnvironment: previewEnvironmentSummary(),
          generatedAt: "2026-05-06T04:01:00.000Z",
        } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_preview_environment_show_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
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
        "preview",
        "environment",
        "show",
        "prenv_cli",
        "--resource",
        "res_api",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(ShowPreviewEnvironmentQuery);
    expect(queries[0]).toMatchObject({
      previewEnvironmentId: "prenv_cli",
      resourceId: "res_api",
    });
  });

  test("[PG-PREVIEW-SURFACE-001] preview environment delete dispatches the application command", async () => {
    ensureReflectMetadata();
    const { DeletePreviewEnvironmentCommand, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({
          status: "cleaned",
          attemptId: "pcln_cli",
          previewEnvironmentId: "prenv_cli",
          resourceId: "res_api",
          sourceBindingFingerprint: "srcfp_pr_42",
          previewEnvironmentStatus: "cleanup-requested",
          cleanedRuntime: true,
          removedRoute: true,
          removedSourceLink: true,
          removedProviderMetadata: false,
          updatedFeedback: false,
        } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_preview_environment_delete_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
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
        "preview",
        "environment",
        "delete",
        "prenv_cli",
        "--resource",
        "res_api",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(DeletePreviewEnvironmentCommand);
    expect(commands[0]).toMatchObject({
      previewEnvironmentId: "prenv_cli",
      resourceId: "res_api",
    });
  });
});
