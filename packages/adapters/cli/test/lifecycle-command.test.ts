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

async function parseCliWithOutput(
  program: { parseAsync(args: string[]): Promise<unknown> },
  args: string[],
): Promise<string> {
  let output = "";
  const writeStdout = process.stdout.write;
  try {
    process.stdout.write = ((
      chunk: string | Uint8Array,
      encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
      callback?: (error?: Error | null) => void,
    ) => {
      output += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      const done = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
      done?.();
      return true;
    }) as typeof process.stdout.write;
    await program.parseAsync(args);
    return output;
  } finally {
    process.stdout.write = writeStdout;
  }
}

describe("CLI lifecycle commands", () => {
  test("[SYSTEM-DIAG-004] doctor prints configured maintenance worker activation", async () => {
    ensureReflectMetadata();
    const { DoctorQuery } = await import("@appaloft/application");
    const { createCliProgram } = await import("../src");
    const queries: AppQuery<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, _command: AppCommand<T>) => ok({} as T),
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        return ok({
          readiness: { status: "ok", checks: [] },
          providers: [],
          plugins: [],
          maintenanceWorkers: [
            {
              key: "scheduled-task-runner",
              label: "Scheduled task runner",
              enabled: false,
              activation: "disabled-by-config",
              safetyMode: "runtime-execution",
              intervalSeconds: 60,
              batchSize: 25,
              configurationKeys: [
                "APPALOFT_SCHEDULED_TASK_RUNNER_ENABLED",
                "APPALOFT_SCHEDULED_TASK_RUNNER_INTERVAL_SECONDS",
                "APPALOFT_SCHEDULED_TASK_RUNNER_BATCH_SIZE",
              ],
              operationKeys: ["scheduled-tasks.run-now", "scheduled-task-runs.run-due"],
            },
            {
              key: "runtime-monitoring-collector-runner",
              label: "Runtime monitoring collector runner",
              enabled: true,
              activation: "starts-with-backend-service",
              safetyMode: "read-only-collection",
              intervalSeconds: 90,
              batchSize: 4,
              rawRetentionHours: 6,
              configurationKeys: [
                "APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_ENABLED",
                "APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_INTERVAL_SECONDS",
                "APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_BATCH_SIZE",
                "APPALOFT_RUNTIME_MONITORING_RAW_RETENTION_HOURS",
              ],
              operationKeys: ["runtime-monitoring.collect"],
            },
          ],
        } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_doctor_maintenance_workers_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });

    const output = await parseCliWithOutput(program, ["node", "appaloft", "doctor"]);
    const rendered = JSON.parse(output) as {
      maintenanceWorkers: Array<{
        activation: string;
        configurationKeys: string[];
        enabled: boolean;
        key: string;
        operationKeys: string[];
        safetyMode: string;
      }>;
    };

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(DoctorQuery);
    expect(rendered.maintenanceWorkers).toContainEqual(
      expect.objectContaining({
        key: "scheduled-task-runner",
        enabled: false,
        activation: "disabled-by-config",
        safetyMode: "runtime-execution",
        configurationKeys: expect.arrayContaining(["APPALOFT_SCHEDULED_TASK_RUNNER_ENABLED"]),
        operationKeys: ["scheduled-tasks.run-now", "scheduled-task-runs.run-due"],
      }),
    );
    expect(rendered.maintenanceWorkers).toContainEqual(
      expect.objectContaining({
        key: "runtime-monitoring-collector-runner",
        enabled: true,
        activation: "starts-with-backend-service",
        safetyMode: "read-only-collection",
        configurationKeys: expect.arrayContaining([
          "APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_ENABLED",
        ]),
        operationKeys: ["runtime-monitoring.collect"],
      }),
    );
  });
});
