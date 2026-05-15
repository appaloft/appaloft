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

describe("CLI runtime monitoring commands", () => {
  test("[RT-MON-003] runtime-monitoring samples dispatches the application query", async () => {
    ensureReflectMetadata();
    const { ListRuntimeMonitoringSamplesQuery } = await import("@appaloft/application");
    const { createCliProgram } = await import("../src");
    const queries: AppQuery<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, _command: AppCommand<T>) => ok({} as T),
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        return ok({
          schemaVersion: "runtime-monitoring.samples.list/v1",
          scope: { kind: "resource", resourceId: "res_api" },
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-01-01T01:00:00.000Z",
          generatedAt: "2026-01-01T01:00:05.000Z",
          freshness: "recent-sample",
          partial: false,
          retention: { rawRetentionHours: 24 },
          samples: [],
          warnings: [],
          sourceErrors: [],
        } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_runtime_monitoring_samples_test",
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
        "runtime-monitoring",
        "samples",
        "resource:res_api",
        "--from",
        "2026-01-01T00:00:00.000Z",
        "--to",
        "2026-01-01T01:00:00.000Z",
        "--signal",
        "cpu",
        "--limit",
        "10",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(ListRuntimeMonitoringSamplesQuery);
    expect(queries[0]).toMatchObject({
      input: {
        scope: { kind: "resource", resourceId: "res_api" },
        window: {
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-01-01T01:00:00.000Z",
        },
        signals: ["cpu"],
        limit: 10,
      },
    });
  });

  test("[RT-MON-002] runtime-monitoring rollup dispatches the application query", async () => {
    ensureReflectMetadata();
    const { RuntimeMonitoringRollupQuery } = await import("@appaloft/application");
    const { createCliProgram } = await import("../src");
    const queries: AppQuery<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, _command: AppCommand<T>) => ok({} as T),
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        return ok({
          schemaVersion: "runtime-monitoring.rollup/v1",
          scope: { kind: "resource", resourceId: "res_api" },
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-01-01T01:00:00.000Z",
          bucket: "minute",
          generatedAt: "2026-01-01T01:00:05.000Z",
          freshness: "recent-sample",
          partial: false,
          retention: { rawRetentionHours: 24 },
          series: [],
          totals: {},
          topContributors: [],
          deploymentMarkers: [],
          warnings: [],
          sourceErrors: [],
        } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_runtime_monitoring_rollup_test",
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
        "runtime-monitoring",
        "rollup",
        "resource:res_api",
        "--from",
        "2026-01-01T00:00:00.000Z",
        "--to",
        "2026-01-01T01:00:00.000Z",
        "--bucket",
        "minute",
        "--signal",
        "cpu",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(RuntimeMonitoringRollupQuery);
    expect(queries[0]).toMatchObject({
      input: {
        scope: { kind: "resource", resourceId: "res_api" },
        window: {
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-01-01T01:00:00.000Z",
        },
        bucket: "minute",
        signals: ["cpu"],
      },
    });
  });

  test("[RT-MON-006] runtime-monitoring thresholds configure dispatches the application command", async () => {
    ensureReflectMetadata();
    const { ConfigureRuntimeMonitoringThresholdsCommand } = await import("@appaloft/application");
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({
          policy: {
            schemaVersion: "runtime-monitoring-thresholds.policy/v1",
            policyId: "rmtp_cli",
            scope: { kind: "resource", resourceId: "res_api" },
            rules: [
              {
                ruleId: "rmtr_disk",
                signal: "disk",
                metric: "usedBytes",
                warning: 100,
                critical: 200,
                comparator: "greater-than-or-equal",
              },
            ],
            enabled: true,
            updatedAt: "2026-01-01T01:00:00.000Z",
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
          requestId: "req_cli_runtime_monitoring_threshold_configure_test",
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
        "runtime-monitoring",
        "thresholds",
        "configure",
        "resource:res_api",
        "--rule",
        '{"signal":"disk","metric":"usedBytes","warning":100,"critical":200}',
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(ConfigureRuntimeMonitoringThresholdsCommand);
    expect(commands[0]).toMatchObject({
      input: {
        scope: { kind: "resource", resourceId: "res_api" },
        rules: [
          {
            signal: "disk",
            metric: "usedBytes",
            warning: 100,
            critical: 200,
            comparator: "greater-than-or-equal",
          },
        ],
        enabled: true,
      },
    });
  });

  test("[RT-MON-006] runtime-monitoring thresholds show dispatches the application query", async () => {
    ensureReflectMetadata();
    const { ShowRuntimeMonitoringThresholdsQuery } = await import("@appaloft/application");
    const { createCliProgram } = await import("../src");
    const queries: AppQuery<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, _command: AppCommand<T>) => ok({} as T),
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        return ok({
          schemaVersion: "runtime-monitoring-thresholds.show/v1",
          scope: { kind: "resource", resourceId: "res_api" },
          generatedAt: "2026-01-01T01:00:05.000Z",
          policy: null,
          evaluation: {
            state: "unknown",
            crossed: [],
            nextActions: ["configure-thresholds"],
            sourceErrors: [],
          },
        } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_runtime_monitoring_threshold_show_test",
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
        "runtime-monitoring",
        "thresholds",
        "show",
        "resource:res_api",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(ShowRuntimeMonitoringThresholdsQuery);
    expect(queries[0]).toMatchObject({
      input: {
        scope: { kind: "resource", resourceId: "res_api" },
      },
    });
  });
});
