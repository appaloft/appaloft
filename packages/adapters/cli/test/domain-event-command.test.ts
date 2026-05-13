import { describe, expect, test } from "bun:test";
import {
  type Command as AppCommand,
  type Query as AppQuery,
  type CommandBus,
  createExecutionContext,
  type ExecutionContextFactory,
  PruneDomainEventsCommand,
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

describe("CLI domain event commands", () => {
  test("[DOMAIN-EVENT-RETENTION-004] domain-event prune dispatches the application command", async () => {
    ensureReflectMetadata();
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({
          schemaVersion: "domain-events.prune/v1",
          before: "2026-01-01T00:05:00.000Z",
          eventType: "deployment.finished",
          aggregateId: "dep_primary",
          aggregateType: "deployment",
          deploymentId: "dep_primary",
          limit: 50,
          dryRun: false,
          inspectedCount: 1,
          candidateCount: 1,
          prunedCount: 1,
          skippedCount: 0,
          countsByEventType: {
            "deployment.finished": 1,
          },
          skippedCountsByReason: {},
          prunedAt: "2026-01-01T00:10:00.000Z",
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
          requestId: "req_cli_domain_event_prune_test",
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
        "domain-event",
        "prune",
        "--before",
        "2026-01-01T00:05:00.000Z",
        "--event-type",
        "deployment.finished",
        "--aggregate",
        "dep_primary",
        "--aggregate-type",
        "deployment",
        "--deployment",
        "dep_primary",
        "--limit",
        "50",
        "--dry-run",
        "false",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(PruneDomainEventsCommand);
    expect(commands[0]).toMatchObject({
      before: "2026-01-01T00:05:00.000Z",
      eventType: "deployment.finished",
      aggregateId: "dep_primary",
      aggregateType: "deployment",
      deploymentId: "dep_primary",
      limit: 50,
      dryRun: false,
    });
  });
});
