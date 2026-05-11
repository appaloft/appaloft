import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type Command as AppCommand,
  type Query as AppQuery,
  type CommandBus,
  createExecutionContext,
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
  const { createCliProgram } = await import("../src");
  const commands: AppCommand<unknown>[] = [];
  const queries: AppQuery<unknown>[] = [];
  const commandBus = {
    execute: async <T>(_context: unknown, command: AppCommand<T>) => {
      commands.push(command as AppCommand<unknown>);
      return ok({
        created: true,
        bootstrapRequired: false,
        userId: "usr_admin",
        email: "admin@example.com",
        organizationId: "org_self_hosted",
        organizationSlug: "self-hosted",
        loginUrl: "http://127.0.0.1:3721/login",
        loginMethods: [{ key: "local-password", configured: true, enabled: true }],
      } as T);
    },
  } as unknown as CommandBus;
  const queryBus = {
    execute: async <T>(_context: unknown, query: AppQuery<T>) => {
      queries.push(query as AppQuery<unknown>);
      return ok({
        bootstrapRequired: true,
        firstAdminConfigured: false,
        organizationConfigured: false,
        loginUrl: "http://127.0.0.1:3721/bootstrap/auth/first-admin",
        loginMethods: [{ key: "local-password", configured: true, enabled: true }],
        nextSteps: ["bootstrap-first-admin"],
      } as T);
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

  return { commands, program, queries };
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

describe("CLI auth commands", () => {
  test("[FIRST-ADMIN-STATUS-001] bootstrap-status dispatches GetAuthBootstrapStatusQuery", async () => {
    const { GetAuthBootstrapStatusQuery } = await import("@appaloft/application");
    const { program, queries } = await createCommandCaptureHarness("req_cli_auth_status_test");

    await parseCli(program, ["node", "appaloft", "auth", "bootstrap-status"]);

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(GetAuthBootstrapStatusQuery);
  });

  test("[FIRST-ADMIN-BOOTSTRAP-001] bootstrap-first-admin dispatches BootstrapFirstAdminCommand", async () => {
    const { BootstrapFirstAdminCommand } = await import("@appaloft/application");
    const { commands, program } = await createCommandCaptureHarness("req_cli_auth_bootstrap_test");

    await parseCli(program, [
      "node",
      "appaloft",
      "auth",
      "bootstrap-first-admin",
      "--email",
      "admin@example.com",
      "--display-name",
      "Admin User",
      "--password",
      "supplied-secret",
      "--organization-name",
      "Self Hosted",
      "--organization-slug",
      "self-hosted",
      "--idempotency-key",
      "idem_first_admin",
    ]);

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(BootstrapFirstAdminCommand);
    expect(commands[0]).toMatchObject({
      email: "admin@example.com",
      displayName: "Admin User",
      password: "supplied-secret",
      organizationName: "Self Hosted",
      organizationSlug: "self-hosted",
      idempotencyKey: "idem_first_admin",
    });
  });
});
