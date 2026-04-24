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

describe("CLI server commands", () => {
  test("[SRV-LIFE-ENTRY-001] server show dispatches the application query", async () => {
    ensureReflectMetadata();
    const { ShowServerQuery, createExecutionContext } = await import("@appaloft/application");
    const { createCliProgram } = await import("../src");
    const queries: AppQuery<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, _command: AppCommand<T>) => ok({} as T),
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        return ok({
          schemaVersion: "servers.show/v1",
          server: {
            id: "srv_primary",
            name: "Primary",
            host: "203.0.113.10",
            port: 22,
            providerKey: "generic-ssh",
            lifecycleStatus: "active",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          generatedAt: "2026-01-01T00:00:10.000Z",
        } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_server_show_test",
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
      await program.parseAsync(["node", "appaloft", "server", "show", "srv_primary"]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(ShowServerQuery);
    expect(queries[0]).toMatchObject({
      serverId: "srv_primary",
      includeRollups: true,
    });
  });

  test("[SRV-LIFE-ENTRY-005] server deactivate dispatches the application command", async () => {
    ensureReflectMetadata();
    const { DeactivateServerCommand, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "srv_primary" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_server_deactivate_test",
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
        "server",
        "deactivate",
        "srv_primary",
        "--reason",
        "retired",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(DeactivateServerCommand);
    expect(commands[0]).toMatchObject({
      serverId: "srv_primary",
      reason: "retired",
    });
  });

  test("[SRV-LIFE-ENTRY-013] server rename dispatches the application command", async () => {
    ensureReflectMetadata();
    const { RenameServerCommand, createExecutionContext } = await import("@appaloft/application");
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "srv_primary" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_server_rename_test",
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
        "server",
        "rename",
        "srv_primary",
        "--name",
        "Primary SSH server",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(RenameServerCommand);
    expect(commands[0]).toMatchObject({
      serverId: "srv_primary",
      name: "Primary SSH server",
    });
  });

  test("[SRV-LIFE-ENTRY-017] server proxy configure dispatches the application command", async () => {
    ensureReflectMetadata();
    const { ConfigureServerEdgeProxyCommand, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({
          id: "srv_primary",
          edgeProxy: {
            kind: "none",
            status: "disabled",
          },
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
          requestId: "req_cli_server_proxy_configure_test",
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
        "server",
        "proxy",
        "configure",
        "srv_primary",
        "--kind",
        "none",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(ConfigureServerEdgeProxyCommand);
    expect(commands[0]).toMatchObject({
      serverId: "srv_primary",
      proxyKind: "none",
    });
  });

  test("[SRV-LIFE-ENTRY-007] server delete-check dispatches the application query", async () => {
    ensureReflectMetadata();
    const { CheckServerDeleteSafetyQuery, createExecutionContext } = await import(
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
          schemaVersion: "servers.delete-check/v1",
          serverId: "srv_primary",
          lifecycleStatus: "inactive",
          eligible: true,
          blockers: [],
          checkedAt: "2026-01-01T00:00:10.000Z",
        } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_server_delete_check_test",
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
      await program.parseAsync(["node", "appaloft", "server", "delete-check", "srv_primary"]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(CheckServerDeleteSafetyQuery);
    expect(queries[0]).toMatchObject({
      serverId: "srv_primary",
    });
  });

  test("[SSH-CRED-ENTRY-002] server credential-show dispatches the reusable SSH credential detail query", async () => {
    ensureReflectMetadata();
    const application = (await import("@appaloft/application")) as Record<string, unknown> & {
      createExecutionContext: typeof import("@appaloft/application").createExecutionContext;
    };
    const ShowSshCredentialQuery = application.ShowSshCredentialQuery as
      | (new (
          ...args: never[]
        ) => AppQuery<unknown>)
      | undefined;
    const { createCliProgram } = await import("../src");
    const queries: AppQuery<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, _command: AppCommand<T>) => ok({} as T),
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        return ok({
          schemaVersion: "credentials.show/v1",
          credential: {
            id: "cred_primary",
            name: "primary-key",
            kind: "ssh-private-key",
            username: "deploy",
            publicKeyConfigured: true,
            privateKeyConfigured: true,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          usage: {
            totalServers: 0,
            activeServers: 0,
            inactiveServers: 0,
            servers: [],
          },
          generatedAt: "2026-01-01T00:00:10.000Z",
        } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        application.createExecutionContext({
          ...input,
          requestId: "req_cli_ssh_credential_show_test",
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
    const writeStderr = process.stderr.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      process.stderr.write = (() => true) as typeof process.stderr.write;
      await program.parseAsync(["node", "appaloft", "server", "credential-show", "cred_primary"]);
    } finally {
      process.stdout.write = writeStdout;
      process.stderr.write = writeStderr;
    }

    expect(ShowSshCredentialQuery, "ShowSshCredentialQuery export").toBeDefined();
    expect(queries).toHaveLength(1);
    if (!ShowSshCredentialQuery) {
      throw new Error("ShowSshCredentialQuery is not exported yet");
    }
    expect(queries[0]).toBeInstanceOf(ShowSshCredentialQuery);
    expect(queries[0]).toMatchObject({
      credentialId: "cred_primary",
      includeUsage: true,
    });
  });

  test("[SRV-LIFE-ENTRY-010] server delete dispatches the application command", async () => {
    ensureReflectMetadata();
    const { DeleteServerCommand, createExecutionContext } = await import("@appaloft/application");
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "srv_primary" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_server_delete_test",
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
        "server",
        "delete",
        "srv_primary",
        "--confirm",
        "srv_primary",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(DeleteServerCommand);
    expect(commands[0]).toMatchObject({
      serverId: "srv_primary",
      confirmation: {
        serverId: "srv_primary",
      },
    });
  });
});
