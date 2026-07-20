import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  AcceptDependencyResourceProvisioningPlanCommand,
  type Command as AppCommand,
  type Query as AppQuery,
  BindResourceDependencyCommand,
  type CommandBus,
  CreateDependencyResourceBackupCommand,
  CreateDependencyResourceProvisioningPlanCommand,
  type ExecutionContextFactory,
  ImportDependencyResourceCommand,
  InspectDependencyResourceQuery,
  ListDependencyResourceBackupsQuery,
  ListDependencyResourcesQuery,
  ListResourceDependencyBindingsQuery,
  ProvisionDependencyResourceCommand,
  type QueryBus,
  QueryDependencyResourceQuery,
  RestoreDependencyResourceBackupCommand,
  RotateDependencyResourceConnectionCommand,
  RotateResourceDependencyBindingSecretCommand,
  ShowDependencyResourceBackupQuery,
  ShowDependencyResourceProvisioningPlanQuery,
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
  test("[DEP-RES-ENTRY-001] dependency provision dispatches command by kind", async () => {
    const { commands, program } = await createCommandCaptureHarness("req_cli_dep_provision");

    await parseCli(program, [
      "node",
      "appaloft",
      "dependency",
      "provision",
      "--kind",
      "postgres",
      "--project",
      "prj_demo",
      "--environment",
      "env_demo",
      "--name",
      "Main DB",
    ]);

    expect(commands[0]).toBeInstanceOf(ProvisionDependencyResourceCommand);
    expect(commands[0]).toMatchObject({
      kind: "postgres",
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "Main DB",
    });
  });

  test("[DEP-RES-ENTRY-001] dependency import dispatches command by kind", async () => {
    const { commands, program } = await createCommandCaptureHarness("req_cli_dep_import");

    await parseCli(program, [
      "node",
      "appaloft",
      "dependency",
      "import",
      "--kind",
      "mysql",
      "--project",
      "prj_demo",
      "--environment",
      "env_demo",
      "--name",
      "External MySQL",
      "--connection-url",
      "mysql://app:secret@db.example.com/app",
    ]);

    expect(commands[0]).toBeInstanceOf(ImportDependencyResourceCommand);
    expect(commands[0]).toMatchObject({
      kind: "mysql",
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "External MySQL",
    });
  });

  test("[DEP-RES-ENTRY-001] dependency import accepts a connection URL from stdin", async () => {
    const { commands, program } = await createCommandCaptureHarness("req_cli_dep_import_stdin");
    const stdin = process.stdin as typeof process.stdin & {
      [Symbol.asyncIterator](): AsyncIterableIterator<Buffer>;
    };
    const originalIterator = stdin[Symbol.asyncIterator];
    stdin[Symbol.asyncIterator] = async function* () {
      yield Buffer.from("postgres://app:secret@db.example.com/app\n");
    };
    try {
      await parseCli(program, [
        "node",
        "appaloft",
        "dependency",
        "import",
        "--kind",
        "postgres",
        "--project",
        "prj_demo",
        "--environment",
        "env_demo",
        "--name",
        "Supabase",
        "--connection-url-stdin",
      ]);
    } finally {
      stdin[Symbol.asyncIterator] = originalIterator;
    }

    expect(commands[0]).toBeInstanceOf(ImportDependencyResourceCommand);
    expect(commands[0]).toMatchObject({
      connectionUrl: "postgres://app:secret@db.example.com/app",
    });

    const { resolveDependencyConnectionUrl } = await import("../src/commands/dependency");
    const conflict = await resolveDependencyConnectionUrl({
      stdin: true,
      value: "postgres://secret-in-argv",
      readStdin: async () => "postgres://secret-from-stdin",
    });
    expect(conflict.isErr()).toBe(true);
  });

  test("[DEP-RES-CONNECTION-ROTATE-003] dependency rotation accepts a connection URL from stdin", async () => {
    const { commands, program } = await createCommandCaptureHarness("req_cli_dep_rotate");
    const stdin = process.stdin as typeof process.stdin & {
      [Symbol.asyncIterator](): AsyncIterableIterator<Buffer>;
    };
    const originalIterator = stdin[Symbol.asyncIterator];
    stdin[Symbol.asyncIterator] = async function* () {
      yield Buffer.from("postgres://app:new-secret@db.example.com/app\n");
    };
    try {
      await parseCli(program, [
        "node",
        "appaloft",
        "dependency",
        "rotate-connection",
        "rsi_external",
        "--connection-url-stdin",
      ]);
    } finally {
      stdin[Symbol.asyncIterator] = originalIterator;
    }

    expect(commands[0]).toBeInstanceOf(RotateDependencyResourceConnectionCommand);
    expect(commands[0]).toMatchObject({
      dependencyResourceId: "rsi_external",
      connectionUrl: "postgres://app:new-secret@db.example.com/app",
    });
  });

  test("[DEP-RES-ENTRY-001] dependency provision/import support additional kinds", async () => {
    const { commands, program } = await createCommandCaptureHarness("req_cli_dep_redis");

    await parseCli(program, [
      "node",
      "appaloft",
      "dependency",
      "provision",
      "--kind",
      "opensearch",
      "--project",
      "prj_demo",
      "--environment",
      "env_demo",
      "--name",
      "Search",
    ]);
    await parseCli(program, [
      "node",
      "appaloft",
      "dependency",
      "import",
      "--kind",
      "object-storage",
      "--project",
      "prj_demo",
      "--environment",
      "env_demo",
      "--name",
      "Artifacts",
      "--connection-url",
      "s3://default:secret@minio.example.com:9000/artifacts",
    ]);

    expect(commands[0]).toBeInstanceOf(ProvisionDependencyResourceCommand);
    expect(commands[0]).toMatchObject({ kind: "opensearch" });
    expect(commands[1]).toBeInstanceOf(ImportDependencyResourceCommand);
    expect(commands[1]).toMatchObject({ kind: "object-storage" });
  });

  test("[DEP-RES-PROV-ENTRY-001] dependency plan acceptance workflow dispatches unified commands", async () => {
    const { commands, program, queries } = await createCommandCaptureHarness(
      "req_cli_dep_provisioning",
    );

    await parseCli(program, [
      "node",
      "appaloft",
      "dependency",
      "plan",
      "--mode",
      "reuse",
      "--kind",
      "opensearch",
      "--project",
      "prj_demo",
      "--environment",
      "env_demo",
      "--name",
      "External Search",
      "--connection-url",
      "https://admin:secret@search.example.com:9200",
    ]);
    await parseCli(program, [
      "node",
      "appaloft",
      "dependency",
      "accept",
      "drp_1",
      "--acknowledge-mutation",
    ]);
    await parseCli(program, ["node", "appaloft", "dependency", "status", "drp_1"]);

    expect(commands[0]).toBeInstanceOf(CreateDependencyResourceProvisioningPlanCommand);
    expect(commands[0]).toMatchObject({
      input: {
        mode: "reuse",
        reuse: {
          kind: "opensearch",
          projectId: "prj_demo",
          environmentId: "env_demo",
          name: "External Search",
        },
      },
    });
    expect(commands[1]).toBeInstanceOf(AcceptDependencyResourceProvisioningPlanCommand);
    expect(queries[0]).toBeInstanceOf(ShowDependencyResourceProvisioningPlanQuery);
  });

  test("[DEP-RES-PG-ENTRY-001] dependency list/show dispatch query bus", async () => {
    const { program, queries } = await createCommandCaptureHarness("req_cli_dep_query");

    await parseCli(program, ["node", "appaloft", "dependency", "list", "--project", "prj_demo"]);
    await parseCli(program, ["node", "appaloft", "dependency", "show", "rsi_pg"]);

    expect(queries[0]).toBeInstanceOf(ListDependencyResourcesQuery);
    expect(queries[1]).toBeInstanceOf(ShowDependencyResourceQuery);
  });

  test("[DEP-SAFE-QRY-009] dependency inspect/query dispatch the shared query operations", async () => {
    const { program, queries } = await createCommandCaptureHarness("req_cli_dep_safe_query");

    await parseCli(program, ["node", "appaloft", "dependency", "inspect", "rsi_pg"]);
    await parseCli(program, [
      "node",
      "appaloft",
      "dependency",
      "query",
      "rsi_pg",
      "--statement",
      "select count(*) as count from products",
      "--max-rows",
      "10",
      "--timeout-ms",
      "3000",
    ]);

    expect(queries[0]).toBeInstanceOf(InspectDependencyResourceQuery);
    expect(queries[1]).toBeInstanceOf(QueryDependencyResourceQuery);
    expect(queries[1]).toMatchObject({
      dependencyResourceId: "rsi_pg",
      statement: "select count(*) as count from products",
      maxRows: 10,
      timeoutMs: 3_000,
    });
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
      "--target-dependency",
      "rsi_supabase",
      "--confirm-data-overwrite",
      "--confirm-runtime-not-restarted",
    ]);

    expect(commands[0]).toBeInstanceOf(CreateDependencyResourceBackupCommand);
    expect(commands[0]).toMatchObject({ dependencyResourceId: "rsi_pg" });
    expect(queries[0]).toBeInstanceOf(ListDependencyResourceBackupsQuery);
    expect(queries[1]).toBeInstanceOf(ShowDependencyResourceBackupQuery);
    expect(commands[1]).toBeInstanceOf(RestoreDependencyResourceBackupCommand);
    expect(commands[1]).toMatchObject({ targetDependencyResourceId: "rsi_supabase" });
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
