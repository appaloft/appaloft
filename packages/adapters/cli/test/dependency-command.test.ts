import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type Command as AppCommand,
  type Query as AppQuery,
  BindResourceDependencyCommand,
  type CommandBus,
  CreateDependencyResourceBackupCommand,
  type ExecutionContextFactory,
  ImportPostgresDependencyResourceCommand,
  ImportRedisDependencyResourceCommand,
  ListDependencyResourceBackupsQuery,
  ListDependencyResourcesQuery,
  ListResourceDependencyBindingsQuery,
  ProvisionPostgresDependencyResourceCommand,
  ProvisionRedisDependencyResourceCommand,
  type QueryBus,
  RestoreDependencyResourceBackupCommand,
  RotateResourceDependencyBindingSecretCommand,
  ShowDependencyResourceBackupQuery,
  ShowDependencyResourceQuery,
  ShowResourceDependencyBindingQuery,
  UnbindResourceDependencyCommand,
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
  const queries: AppQuery<unknown>[] = [];
  const commandBus = {
    execute: async <T>(_context: unknown, command: AppCommand<T>) => {
      commands.push(command as AppCommand<unknown>);
      return ok({ id: "rsi_pg" } as T);
    },
  } as unknown as CommandBus;
  const queryBus = {
    execute: async <T>(_context: unknown, query: AppQuery<T>) => {
      queries.push(query as AppQuery<unknown>);
      return ok({} as T);
    },
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

  return { commands, queries, program };
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

describe("CLI dependency commands", () => {
  test("[DEP-RES-PG-ENTRY-001] dependency postgres provision dispatches command", async () => {
    const { commands, program } = await createCommandCaptureHarness("req_cli_dep_provision");

    await parseCli(program, [
      "node",
      "appaloft",
      "dependency",
      "postgres",
      "provision",
      "--project",
      "prj_demo",
      "--environment",
      "env_demo",
      "--name",
      "Main DB",
    ]);

    expect(commands[0]).toBeInstanceOf(ProvisionPostgresDependencyResourceCommand);
    expect(commands[0]).toMatchObject({
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "Main DB",
    });
  });

  test("[DEP-RES-PG-ENTRY-001] dependency postgres import dispatches command", async () => {
    const { commands, program } = await createCommandCaptureHarness("req_cli_dep_import");

    await parseCli(program, [
      "node",
      "appaloft",
      "dependency",
      "postgres",
      "import",
      "--project",
      "prj_demo",
      "--environment",
      "env_demo",
      "--name",
      "External DB",
      "--connection-url",
      "postgres://app:secret@db.example.com/app",
    ]);

    expect(commands[0]).toBeInstanceOf(ImportPostgresDependencyResourceCommand);
    expect(commands[0]).toMatchObject({
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "External DB",
    });
  });

  test("[DEP-RES-REDIS-ENTRY-001] dependency redis provision/import dispatch commands", async () => {
    const { commands, program } = await createCommandCaptureHarness("req_cli_dep_redis");

    await parseCli(program, [
      "node",
      "appaloft",
      "dependency",
      "redis",
      "provision",
      "--project",
      "prj_demo",
      "--environment",
      "env_demo",
      "--name",
      "Main Cache",
    ]);
    await parseCli(program, [
      "node",
      "appaloft",
      "dependency",
      "redis",
      "import",
      "--project",
      "prj_demo",
      "--environment",
      "env_demo",
      "--name",
      "External Cache",
      "--connection-url",
      "redis://default:secret@cache.example.com:6379/0",
    ]);

    expect(commands[0]).toBeInstanceOf(ProvisionRedisDependencyResourceCommand);
    expect(commands[1]).toBeInstanceOf(ImportRedisDependencyResourceCommand);
  });

  test("[DEP-RES-PG-ENTRY-001] dependency list/show dispatch query bus", async () => {
    const { program, queries } = await createCommandCaptureHarness("req_cli_dep_query");

    await parseCli(program, ["node", "appaloft", "dependency", "list", "--project", "prj_demo"]);
    await parseCli(program, ["node", "appaloft", "dependency", "show", "rsi_pg"]);

    expect(queries[0]).toBeInstanceOf(ListDependencyResourcesQuery);
    expect(queries[1]).toBeInstanceOf(ShowDependencyResourceQuery);
  });

  test("[DEP-RES-BACKUP-011] dependency backup commands dispatch buses", async () => {
    const { commands, program, queries } = await createCommandCaptureHarness("req_cli_dep_backup");

    await parseCli(program, [
      "node",
      "appaloft",
      "dependency",
      "backup",
      "create",
      "rsi_pg",
      "--description",
      "pre deploy",
    ]);
    await parseCli(program, ["node", "appaloft", "dependency", "backup", "list", "rsi_pg"]);
    await parseCli(program, ["node", "appaloft", "dependency", "backup", "show", "drb_1"]);
    await parseCli(program, [
      "node",
      "appaloft",
      "dependency",
      "backup",
      "restore",
      "drb_1",
      "--confirm-data-overwrite",
      "--confirm-runtime-not-restarted",
    ]);

    expect(commands[0]).toBeInstanceOf(CreateDependencyResourceBackupCommand);
    expect(commands[0]).toMatchObject({ dependencyResourceId: "rsi_pg" });
    expect(queries[0]).toBeInstanceOf(ListDependencyResourceBackupsQuery);
    expect(queries[1]).toBeInstanceOf(ShowDependencyResourceBackupQuery);
    expect(commands[1]).toBeInstanceOf(RestoreDependencyResourceBackupCommand);
  });

  test("[DEP-BIND-PG-ENTRY-001] resource dependency commands dispatch buses", async () => {
    const { commands, program, queries } = await createCommandCaptureHarness("req_cli_dep_bind");

    await parseCli(program, [
      "node",
      "appaloft",
      "resource",
      "dependency",
      "bind",
      "res_web",
      "rsi_pg",
      "--target-name",
      "DATABASE_URL",
    ]);
    await parseCli(program, [
      "node",
      "appaloft",
      "resource",
      "dependency",
      "unbind",
      "res_web",
      "rbd_pg",
    ]);
    await parseCli(program, [
      "node",
      "appaloft",
      "resource",
      "dependency",
      "rotate-secret",
      "res_web",
      "rbd_pg",
      "--secret-ref",
      "secret://dependency-binding/rbd_pg/current",
      "--confirm-historical-snapshots-remain-unchanged",
    ]);
    await parseCli(program, ["node", "appaloft", "resource", "dependency", "list", "res_web"]);
    await parseCli(program, [
      "node",
      "appaloft",
      "resource",
      "dependency",
      "show",
      "res_web",
      "rbd_pg",
    ]);

    expect(commands[0]).toBeInstanceOf(BindResourceDependencyCommand);
    expect(commands[1]).toBeInstanceOf(UnbindResourceDependencyCommand);
    expect(commands[2]).toBeInstanceOf(RotateResourceDependencyBindingSecretCommand);
    expect(queries[0]).toBeInstanceOf(ListResourceDependencyBindingsQuery);
    expect(queries[1]).toBeInstanceOf(ShowResourceDependencyBindingQuery);
  });
});
