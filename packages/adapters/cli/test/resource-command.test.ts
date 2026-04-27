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

async function createCommandCaptureHarness(requestId: string) {
  ensureReflectMetadata();
  const { createExecutionContext } = await import("@appaloft/application");
  const { createCliProgram } = await import("../src");
  const commands: AppCommand<unknown>[] = [];
  const commandBus = {
    execute: async <T>(_context: unknown, command: AppCommand<T>) => {
      commands.push(command as AppCommand<unknown>);
      return ok({ id: "res_demo" } as T);
    },
  } as unknown as CommandBus;
  const queryBus = {
    execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
  } as unknown as QueryBus;
  const executionContextFactory: ExecutionContextFactory = {
    create: (input) =>
      createExecutionContext({
        ...input,
        requestId,
      }),
  };
  const program = createCliProgram({
    version: "0.1.0-test",
    startServer: async () => {},
    commandBus,
    queryBus,
    executionContextFactory,
  });

  return { commands, program };
}

async function parseCli(program: { parseAsync(args: string[]): Promise<unknown> }, args: string[]) {
  const writeStdout = process.stdout.write;
  try {
    process.stdout.write = (() => true) as typeof process.stdout.write;
    await program.parseAsync(args);
  } finally {
    process.stdout.write = writeStdout;
  }
}

describe("CLI resource commands", () => {
  test("[RES-PROFILE-ENTRY-003] resource configure-runtime dispatches the application command", async () => {
    ensureReflectMetadata();
    const { ConfigureResourceRuntimeCommand, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "res_demo" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_resource_runtime_test",
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
        "resource",
        "configure-runtime",
        "res_demo",
        "--strategy",
        "dockerfile",
        "--install-command",
        "bun install",
        "--build-command",
        "bun run build",
        "--start-command",
        "bun run start",
        "--runtime-name",
        "preview-123",
        "--dockerfile-path",
        "docker/Dockerfile",
        "--build-target",
        "runner",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(ConfigureResourceRuntimeCommand);
    expect(commands[0]).toMatchObject({
      resourceId: "res_demo",
      runtimeProfile: {
        strategy: "dockerfile",
        installCommand: "bun install",
        buildCommand: "bun run build",
        startCommand: "bun run start",
        runtimeName: "preview-123",
        dockerfilePath: "docker/Dockerfile",
        buildTarget: "runner",
      },
    });
  });

  test("[RES-PROFILE-ENTRY-003] resource archive dispatches the application command", async () => {
    ensureReflectMetadata();
    const { ArchiveResourceCommand, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "res_demo" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_resource_archive_test",
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
        "resource",
        "archive",
        "res_demo",
        "--reason",
        "Retired after migration",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(ArchiveResourceCommand);
    expect(commands[0]).toMatchObject({
      resourceId: "res_demo",
      reason: "Retired after migration",
    });
  });

  test("[RES-PROFILE-ENTRY-010] resource configure-access dispatches the application command", async () => {
    ensureReflectMetadata();
    const { ConfigureResourceAccessCommand, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "res_demo" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_resource_access_test",
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
        "resource",
        "configure-access",
        "res_demo",
        "--generated-access",
        "disabled",
        "--path-prefix",
        "/internal",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(ConfigureResourceAccessCommand);
    expect(commands[0]).toMatchObject({
      resourceId: "res_demo",
      accessProfile: {
        generatedAccessMode: "disabled",
        pathPrefix: "/internal",
      },
    });
  });

  test("[RES-PROFILE-ENTRY-003] resource configure-source dispatches the application command", async () => {
    const { ConfigureResourceSourceCommand } = await import("@appaloft/application");
    const { commands, program } = await createCommandCaptureHarness("req_cli_resource_source_test");

    await parseCli(program, [
      "node",
      "appaloft",
      "resource",
      "configure-source",
      "res_demo",
      "--kind",
      "git-public",
      "--locator",
      "https://github.com/appaloft/demo",
      "--display-name",
      "demo repo",
      "--git-ref",
      "main",
      "--base-directory",
      "apps/web",
    ]);

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(ConfigureResourceSourceCommand);
    expect(commands[0]).toMatchObject({
      resourceId: "res_demo",
      source: {
        kind: "git-public",
        locator: "https://github.com/appaloft/demo",
        displayName: "demo repo",
        gitRef: "main",
        baseDirectory: "apps/web",
      },
    });
  });

  test("[RES-PROFILE-ENTRY-003] resource configure-network dispatches the application command", async () => {
    const { ConfigureResourceNetworkCommand } = await import("@appaloft/application");
    const { commands, program } = await createCommandCaptureHarness(
      "req_cli_resource_network_test",
    );

    await parseCli(program, [
      "node",
      "appaloft",
      "resource",
      "configure-network",
      "res_demo",
      "--internal-port",
      "8080",
      "--upstream-protocol",
      "http",
      "--exposure-mode",
      "reverse-proxy",
      "--target-service",
      "web",
    ]);

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(ConfigureResourceNetworkCommand);
    expect(commands[0]).toMatchObject({
      resourceId: "res_demo",
      networkProfile: {
        internalPort: 8080,
        upstreamProtocol: "http",
        exposureMode: "reverse-proxy",
        targetServiceName: "web",
      },
    });
  });

  test("[RES-PROFILE-ENTRY-003] resource configure-health dispatches the application command", async () => {
    const { ConfigureResourceHealthCommand } = await import("@appaloft/application");
    const { commands, program } = await createCommandCaptureHarness("req_cli_resource_health_test");

    await parseCli(program, [
      "node",
      "appaloft",
      "resource",
      "configure-health",
      "res_demo",
      "--path",
      "/ready",
      "--expected-status",
      "204",
      "--interval",
      "7",
      "--timeout",
      "3",
      "--retries",
      "4",
      "--start-period",
      "2",
    ]);

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(ConfigureResourceHealthCommand);
    expect(commands[0]).toMatchObject({
      resourceId: "res_demo",
      healthCheck: {
        enabled: true,
        type: "http",
        intervalSeconds: 7,
        timeoutSeconds: 3,
        retries: 4,
        startPeriodSeconds: 2,
        http: {
          method: "GET",
          scheme: "http",
          host: "localhost",
          path: "/ready",
          expectedStatusCode: 204,
        },
      },
    });
  });

  test("[RES-PROFILE-ENTRY-003] resource set-variable dispatches the application command", async () => {
    ensureReflectMetadata();
    const { SetResourceVariableCommand, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "res_demo" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_resource_set_variable_test",
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
        "resource",
        "set-variable",
        "res_demo",
        "DATABASE_URL",
        "postgres://resource",
        "--kind",
        "secret",
        "--exposure",
        "runtime",
        "--secret",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(SetResourceVariableCommand);
    expect(commands[0]).toMatchObject({
      resourceId: "res_demo",
      key: "DATABASE_URL",
      value: "postgres://resource",
      kind: "secret",
      exposure: "runtime",
      isSecret: true,
    });
  });

  test("[RES-PROFILE-ENTRY-003] resource unset-variable dispatches the application command", async () => {
    const { UnsetResourceVariableCommand } = await import("@appaloft/application");
    const { commands, program } = await createCommandCaptureHarness(
      "req_cli_resource_unset_variable_test",
    );

    await parseCli(program, [
      "node",
      "appaloft",
      "resource",
      "unset-variable",
      "res_demo",
      "DATABASE_URL",
      "--exposure",
      "runtime",
    ]);

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(UnsetResourceVariableCommand);
    expect(commands[0]).toMatchObject({
      resourceId: "res_demo",
      key: "DATABASE_URL",
      exposure: "runtime",
    });
  });

  test("[RES-PROFILE-ENTRY-003] resource effective-config dispatches the application query", async () => {
    ensureReflectMetadata();
    const { ResourceEffectiveConfigQuery, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const queries: AppQuery<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, _command: AppCommand<T>) => ok({} as T),
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        return ok({
          schemaVersion: "resources.effective-config/v1",
          resourceId: "res_demo",
          environmentId: "env_demo",
          ownedEntries: [],
          effectiveEntries: [],
          precedence: [
            "defaults",
            "system",
            "organization",
            "project",
            "environment",
            "resource",
            "deployment",
          ],
          generatedAt: "2026-01-01T00:00:00.000Z",
        } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_resource_effective_config_test",
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
      await program.parseAsync(["node", "appaloft", "resource", "effective-config", "res_demo"]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(ResourceEffectiveConfigQuery);
    expect(queries[0]).toMatchObject({
      resourceId: "res_demo",
    });
  });

  test("[RES-PROFILE-ENTRY-006] resource delete dispatches the application command", async () => {
    ensureReflectMetadata();
    const { DeleteResourceCommand, createExecutionContext } = await import("@appaloft/application");
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "res_demo" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_resource_delete_test",
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
        "resource",
        "delete",
        "res_demo",
        "--confirm-slug",
        "web",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(DeleteResourceCommand);
    expect(commands[0]).toMatchObject({
      resourceId: "res_demo",
      confirmation: {
        resourceSlug: "web",
      },
    });
  });
});
