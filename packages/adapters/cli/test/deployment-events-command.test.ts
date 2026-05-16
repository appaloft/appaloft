import { describe, expect, test } from "bun:test";
import {
  type AppQuery,
  type CommandBus,
  type DeploymentEventStream,
  type DeploymentEventStreamEnvelope,
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

class CloseTrackingDeploymentEventStream implements DeploymentEventStream {
  closed = false;

  constructor(private readonly envelopes: DeploymentEventStreamEnvelope[]) {}

  async close(): Promise<void> {
    this.closed = true;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<DeploymentEventStreamEnvelope> {
    for (const envelope of this.envelopes) {
      yield envelope;
    }
  }
}

describe("CLI deployment event commands", () => {
  test("[DEP-EVENTS-ENTRY-003] deployments events --follow --json dispatches stream query and closes cleanly", async () => {
    ensureReflectMetadata();
    const { createCliProgram } = await import("../src");
    const { createExecutionContext, StreamDeploymentEventsQuery } = await import(
      "@appaloft/application"
    );
    const queries: AppQuery<unknown>[] = [];
    const stream = new CloseTrackingDeploymentEventStream([
      {
        schemaVersion: "deployments.stream-events/v1",
        kind: "closed",
        reason: "cancelled",
        cursor: "dep_demo:1",
      },
    ]);
    const commandBus = {
      execute: async () => ok({}),
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        return ok({
          mode: "stream",
          deploymentId: "dep_demo",
          stream,
        } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_deployment_events_test",
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
        "deployments",
        "events",
        "dep_demo",
        "--follow",
        "--json",
        "--cursor",
        "dep_demo:1",
        "--history-limit",
        "25",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(StreamDeploymentEventsQuery);
    expect(queries[0]).toMatchObject({
      deploymentId: "dep_demo",
      cursor: "dep_demo:1",
      follow: true,
      historyLimit: 25,
    });
    expect(stream.closed).toBe(true);
  });
});
