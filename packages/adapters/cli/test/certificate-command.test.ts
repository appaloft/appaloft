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
      return ok({ certificateId: "crt_demo", attemptId: "cat_demo" } as T);
    },
  } as unknown as CommandBus;
  const queryBus = {
    execute: async <T>(_context: unknown, query: AppQuery<T>) => {
      queries.push(query as AppQuery<unknown>);
      return ok({ id: "crt_demo", status: "active" } as T);
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

describe("CLI certificate commands", () => {
  test("[ROUTE-TLS-ENTRY-026] certificate show dispatches ShowCertificateQuery", async () => {
    const { ShowCertificateQuery } = await import("@appaloft/application");
    const { program, queries } = await createCommandCaptureHarness("req_cli_certificate_show_test");

    await parseCli(program, ["node", "appaloft", "certificate", "show", "crt_demo"]);

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(ShowCertificateQuery);
    expect(queries[0]).toMatchObject({ certificateId: "crt_demo" });
  });

  test("[ROUTE-TLS-ENTRY-027] certificate retry dispatches RetryCertificateCommand", async () => {
    const { RetryCertificateCommand } = await import("@appaloft/application");
    const { commands, program } = await createCommandCaptureHarness(
      "req_cli_certificate_retry_test",
    );

    await parseCli(program, [
      "node",
      "appaloft",
      "certificate",
      "retry",
      "crt_demo",
      "--idempotency-key",
      "retry-key",
    ]);

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(RetryCertificateCommand);
    expect(commands[0]).toMatchObject({
      certificateId: "crt_demo",
      idempotencyKey: "retry-key",
    });
  });

  test("[ROUTE-TLS-ENTRY-028] certificate revoke dispatches RevokeCertificateCommand", async () => {
    const { RevokeCertificateCommand } = await import("@appaloft/application");
    const { commands, program } = await createCommandCaptureHarness(
      "req_cli_certificate_revoke_test",
    );

    await parseCli(program, [
      "node",
      "appaloft",
      "certificate",
      "revoke",
      "crt_demo",
      "--reason",
      "operator-requested",
    ]);

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(RevokeCertificateCommand);
    expect(commands[0]).toMatchObject({
      certificateId: "crt_demo",
      reason: "operator-requested",
    });
  });

  test("[ROUTE-TLS-ENTRY-029] certificate delete dispatches DeleteCertificateCommand", async () => {
    const { DeleteCertificateCommand } = await import("@appaloft/application");
    const { commands, program } = await createCommandCaptureHarness(
      "req_cli_certificate_delete_test",
    );

    await parseCli(program, [
      "node",
      "appaloft",
      "certificate",
      "delete",
      "crt_demo",
      "--confirm",
      "crt_demo",
    ]);

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(DeleteCertificateCommand);
    expect(commands[0]).toMatchObject({
      certificateId: "crt_demo",
      confirmation: { certificateId: "crt_demo" },
    });
  });
});
