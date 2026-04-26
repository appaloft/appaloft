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

describe("CLI default access commands", () => {
  test("[DEF-ACCESS-ENTRY-006] default-access configure dispatches the application command", async () => {
    ensureReflectMetadata();
    const { ConfigureDefaultAccessDomainPolicyCommand, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "dap_demo" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_default_access_policy_test",
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
        "default-access",
        "configure",
        "--scope",
        "deployment-target",
        "--server",
        "srv_demo",
        "--mode",
        "provider",
        "--provider",
        "sslip",
        "--idempotency-key",
        "policy-1",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(ConfigureDefaultAccessDomainPolicyCommand);
    expect(commands[0]).toMatchObject({
      scope: { kind: "deployment-target", serverId: "srv_demo" },
      mode: "provider",
      providerKey: "sslip",
      idempotencyKey: "policy-1",
    });
  });

  test("[DEF-ACCESS-ENTRY-007] default-access list dispatches the application query", async () => {
    ensureReflectMetadata();
    const { ListDefaultAccessDomainPoliciesQuery, createExecutionContext } = await import(
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
          schemaVersion: "default-access-domain-policies.list/v1",
          items: [],
        } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_default_access_policy_list_test",
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
      await program.parseAsync(["node", "appaloft", "default-access", "list"]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(ListDefaultAccessDomainPoliciesQuery);
  });

  test("[DEF-ACCESS-ENTRY-007] default-access show dispatches the application query", async () => {
    ensureReflectMetadata();
    const { ShowDefaultAccessDomainPolicyQuery, createExecutionContext } = await import(
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
          schemaVersion: "default-access-domain-policies.show/v1",
          scope: { kind: "deployment-target", serverId: "srv_demo" },
          policy: null,
        } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_default_access_policy_show_test",
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
        "default-access",
        "show",
        "--scope",
        "deployment-target",
        "--server",
        "srv_demo",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(ShowDefaultAccessDomainPolicyQuery);
    expect(queries[0]).toMatchObject({
      scopeKind: "deployment-target",
      serverId: "srv_demo",
    });
  });
});
