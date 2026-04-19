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

describe("CLI source link commands", () => {
  test("[SOURCE-LINK-STATE-008] source-links relink dispatches the application command", async () => {
    ensureReflectMetadata();
    const { createExecutionContext, RelinkSourceLinkCommand } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({
          sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
          projectId: "prj_demo",
          environmentId: "env_demo",
          resourceId: "res_demo",
          serverId: "srv_demo",
          destinationId: "dst_demo",
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
          requestId: "req_cli_source_link_test",
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
        "source-links",
        "relink",
        "source-fingerprint:v1:branch%3Amain",
        "--project",
        "prj_demo",
        "--environment",
        "env_demo",
        "--resource",
        "res_demo",
        "--server",
        "srv_demo",
        "--destination",
        "dst_demo",
        "--expected-current-resource",
        "res_old",
        "--reason",
        "move to canonical resource",
        "--server-host",
        "203.0.113.10",
        "--server-ssh-private-key-file",
        "/home/runner/.ssh/appaloft",
        "--state-backend",
        "ssh-pglite",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(RelinkSourceLinkCommand);
    expect(commands[0]).toMatchObject({
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      expectedCurrentResourceId: "res_old",
      reason: "move to canonical resource",
    });
  });
});
