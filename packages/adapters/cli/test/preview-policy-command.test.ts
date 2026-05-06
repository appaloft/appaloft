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

describe("CLI preview policy commands", () => {
  test("[PG-PREVIEW-SURFACE-001] preview policy configure dispatches the application command", async () => {
    ensureReflectMetadata();
    const { ConfigurePreviewPolicyCommand, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "ppol_cli" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_preview_policy_configure_test",
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
        "policy",
        "configure",
        "--scope",
        "resource",
        "--project",
        "prj_demo",
        "--resource",
        "res_api",
        "--same-repository-previews",
        "true",
        "--fork-previews",
        "without-secrets",
        "--secret-backed-previews",
        "false",
        "--max-active-previews",
        "5",
        "--preview-ttl-hours",
        "24",
        "--idempotency-key",
        "preview-policy-cli-1",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(ConfigurePreviewPolicyCommand);
    expect(commands[0]).toMatchObject({
      scope: {
        kind: "resource",
        projectId: "prj_demo",
        resourceId: "res_api",
      },
      policy: {
        sameRepositoryPreviews: true,
        forkPreviews: "without-secrets",
        secretBackedPreviews: false,
        maxActivePreviews: 5,
        previewTtlHours: 24,
      },
      idempotencyKey: "preview-policy-cli-1",
    });
  });

  test("[PG-PREVIEW-SURFACE-001] preview policy show dispatches the application query", async () => {
    ensureReflectMetadata();
    const { ShowPreviewPolicyQuery, createExecutionContext } = await import(
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
          schemaVersion: "preview-policies.show/v1",
          policy: {
            scope: {
              kind: "project",
              projectId: "prj_demo",
            },
            source: "default",
            settings: {
              sameRepositoryPreviews: true,
              forkPreviews: "disabled",
              secretBackedPreviews: true,
            },
          },
          generatedAt: "2026-05-06T04:00:00.000Z",
        } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_preview_policy_show_test",
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
        "policy",
        "show",
        "--project",
        "prj_demo",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(ShowPreviewPolicyQuery);
    expect(queries[0]).toMatchObject({
      scope: {
        kind: "project",
        projectId: "prj_demo",
      },
    });
  });
});
