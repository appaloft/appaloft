import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  ConfigureRuntimeMonitoringThresholdsCommand,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  ListRuntimeMonitoringSamplesQuery,
  type Query,
  type QueryBus,
  RuntimeMonitoringRollupQuery,
  ShowRuntimeMonitoringThresholdsQuery,
} from "@appaloft/application";
import { ok, type Result } from "@appaloft/core";
import { Elysia } from "elysia";

import { mountAppaloftOrpcRoutes } from "../src";

class NoopLogger implements AppLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

class TestExecutionContextFactory implements ExecutionContextFactory {
  create(input: Parameters<ExecutionContextFactory["create"]>[0]): ExecutionContext {
    return createExecutionContext({
      requestId: input.requestId ?? "req_orpc_runtime_monitoring_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

function createApp(capture: (message: Command<unknown> | Query<unknown>) => void) {
  const commandBus = {
    execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
      capture(command as Command<unknown>);
      if (command instanceof ConfigureRuntimeMonitoringThresholdsCommand) {
        return ok({
          policy: {
            schemaVersion: "runtime-monitoring-thresholds.policy/v1",
            policyId: "rmtp_res_api",
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
      }
      return ok({} as T);
    },
  } as CommandBus;
  const queryBus = {
    execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
      capture(query as Query<unknown>);
      if (query instanceof ListRuntimeMonitoringSamplesQuery) {
        return ok({
          schemaVersion: "runtime-monitoring.samples.list/v1",
          scope: { kind: "resource", resourceId: "res_api" },
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-01-01T01:00:00.000Z",
          generatedAt: "2026-01-01T01:00:05.000Z",
          freshness: "recent-sample",
          partial: false,
          retention: {
            rawRetentionHours: 24,
            retainedFrom: "2026-01-01T00:00:00.000Z",
            retainedTo: "2026-01-02T00:00:00.000Z",
          },
          samples: [
            {
              sampleId: "rms_api_1",
              observedAt: "2026-01-01T00:10:00.000Z",
              collectedAt: "2026-01-01T00:10:03.000Z",
              scopeEvidence: {
                scope: { kind: "resource", resourceId: "res_api" },
                resourceId: "res_api",
              },
              totals: {
                cpu: { containerCpuPercent: 11 },
              },
              freshness: "recent-sample",
              partial: false,
              labels: { providerKey: "generic-ssh" },
              warnings: [],
              sourceErrors: [],
            },
          ],
          warnings: [],
          sourceErrors: [],
        } as T);
      }
      if (query instanceof ShowRuntimeMonitoringThresholdsQuery) {
        return ok({
          schemaVersion: "runtime-monitoring-thresholds.show/v1",
          scope: { kind: "resource", resourceId: "res_api" },
          generatedAt: "2026-01-01T01:00:05.000Z",
          policy: {
            schemaVersion: "runtime-monitoring-thresholds.policy/v1",
            policyId: "rmtp_res_api",
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
          evaluation: {
            state: "critical",
            evaluatedAt: "2026-01-01T01:00:00.000Z",
            sourceSampleId: "rms_api_1",
            crossed: [
              {
                ruleId: "rmtr_disk",
                signal: "disk",
                metric: "usedBytes",
                severity: "critical",
                observedValue: 250,
                boundary: 200,
              },
            ],
            nextActions: ["open-runtime-monitoring", "inspect-runtime-usage"],
            sourceErrors: [],
          },
        } as T);
      }

      return ok({
        schemaVersion: "runtime-monitoring.rollup/v1",
        scope: { kind: "resource", resourceId: "res_api" },
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-01T01:00:00.000Z",
        bucket: "minute",
        generatedAt: "2026-01-01T01:00:05.000Z",
        freshness: "recent-sample",
        partial: false,
        retention: {
          rawRetentionHours: 24,
          retainedFrom: "2026-01-01T00:00:00.000Z",
          retainedTo: "2026-01-02T00:00:00.000Z",
        },
        series: [
          {
            signal: "cpu",
            points: [
              {
                from: "2026-01-01T00:10:00.000Z",
                to: "2026-01-01T00:11:00.000Z",
                sampleCount: 1,
                totals: { cpu: { containerCpuPercent: 11 } },
              },
            ],
          },
        ],
        totals: { cpu: { containerCpuPercent: 11 } },
        topContributors: [],
        deploymentMarkers: [
          {
            deploymentId: "dep_api",
            resourceId: "res_api",
            environmentId: "env_prod",
            observedAt: "2026-01-01T00:05:00.000Z",
            status: "succeeded",
            label: "Deployment dep_api succeeded",
            correlation: "time",
          },
        ],
        warnings: [],
        sourceErrors: [],
      } as T);
    },
  } as QueryBus;

  return mountAppaloftOrpcRoutes(new Elysia(), {
    commandBus,
    executionContextFactory: new TestExecutionContextFactory(),
    logger: new NoopLogger(),
    queryBus,
  });
}

describe("runtime monitoring HTTP routes", () => {
  test("[RT-MON-003] dispatches samples.list through HTTP", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const app = createApp((query) => {
      capturedQuery = query;
    });

    const response = await app.handle(
      new Request(
        "http://localhost/api/runtime-monitoring/samples?scope.kind=resource&scope.resourceId=res_api&window.from=2026-01-01T00%3A00%3A00.000Z&window.to=2026-01-01T01%3A00%3A00.000Z",
        { method: "GET" },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schemaVersion: "runtime-monitoring.samples.list/v1",
      scope: { kind: "resource", resourceId: "res_api" },
      samples: [
        {
          sampleId: "rms_api_1",
          totals: { cpu: { containerCpuPercent: 11 } },
        },
      ],
    });
    expect(capturedQuery).toBeInstanceOf(ListRuntimeMonitoringSamplesQuery);
    expect(capturedQuery).toMatchObject({
      input: {
        scope: { kind: "resource", resourceId: "res_api" },
        limit: 300,
      },
    });
  });

  test("[RT-MON-002][RT-MON-004] dispatches rollup through HTTP", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const app = createApp((query) => {
      capturedQuery = query;
    });

    const response = await app.handle(
      new Request(
        "http://localhost/api/runtime-monitoring/rollup?scope.kind=resource&scope.resourceId=res_api&window.from=2026-01-01T00%3A00%3A00.000Z&window.to=2026-01-01T01%3A00%3A00.000Z&bucket=minute",
        { method: "GET" },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schemaVersion: "runtime-monitoring.rollup/v1",
      scope: { kind: "resource", resourceId: "res_api" },
      deploymentMarkers: [
        {
          deploymentId: "dep_api",
          correlation: "time",
        },
      ],
    });
    expect(capturedQuery).toBeInstanceOf(RuntimeMonitoringRollupQuery);
    expect(capturedQuery).toMatchObject({
      input: {
        scope: { kind: "resource", resourceId: "res_api" },
        bucket: "minute",
        includeDeploymentMarkers: true,
        includeTopContributors: true,
      },
    });
  });

  test("[RT-MON-006] dispatches threshold configure through HTTP", async () => {
    let capturedMessage: Command<unknown> | Query<unknown> | undefined;
    const app = createApp((message) => {
      capturedMessage = message;
    });

    const response = await app.handle(
      new Request("http://localhost/api/runtime-monitoring/thresholds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope: { kind: "resource", resourceId: "res_api" },
          rules: [
            {
              signal: "disk",
              metric: "usedBytes",
              warning: 100,
              critical: 200,
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      policy: {
        schemaVersion: "runtime-monitoring-thresholds.policy/v1",
        policyId: "rmtp_res_api",
        enabled: true,
      },
    });
    expect(capturedMessage).toBeInstanceOf(ConfigureRuntimeMonitoringThresholdsCommand);
    expect(capturedMessage).toMatchObject({
      input: {
        scope: { kind: "resource", resourceId: "res_api" },
        rules: [
          {
            signal: "disk",
            metric: "usedBytes",
            warning: 100,
            critical: 200,
          },
        ],
        enabled: true,
      },
    });
  });

  test("[RT-MON-006] dispatches threshold show through HTTP", async () => {
    let capturedMessage: Command<unknown> | Query<unknown> | undefined;
    const app = createApp((message) => {
      capturedMessage = message;
    });

    const response = await app.handle(
      new Request(
        "http://localhost/api/runtime-monitoring/thresholds?scope.kind=resource&scope.resourceId=res_api",
        { method: "GET" },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schemaVersion: "runtime-monitoring-thresholds.show/v1",
      scope: { kind: "resource", resourceId: "res_api" },
      evaluation: {
        state: "critical",
      },
    });
    expect(capturedMessage).toBeInstanceOf(ShowRuntimeMonitoringThresholdsQuery);
    expect(capturedMessage).toMatchObject({
      input: {
        scope: { kind: "resource", resourceId: "res_api" },
      },
    });
  });
});
