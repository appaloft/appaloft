import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { ok, type Result } from "@appaloft/core";

import {
  createExecutionContext,
  type ExecutionContext,
  ResourceHealthHistoryQuery,
  type ResourceHealthHistoryReadInput,
  type ResourceHealthHistoryReadResult,
  type ResourceHealthObservationHistoryReadModel,
  type ResourceHealthSummary,
} from "../src";
import { ResourceHealthHistoryQueryService } from "../src/resource-handlers";

function unwrap<T>(result: Result<T>): T {
  expect(result.isOk()).toBe(true);
  return result._unsafeUnwrap();
}

const fixedClock = {
  now: () => "2026-01-01T00:10:00.000Z",
};

function createTestContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_resource_health_history",
    entrypoint: "system",
  });
}

function summary(input: {
  resourceId: string;
  observedAt: string;
  overall: ResourceHealthSummary["overall"];
}): ResourceHealthSummary {
  return {
    schemaVersion: "resources.health/v1",
    resourceId: input.resourceId,
    generatedAt: input.observedAt,
    observedAt: input.observedAt,
    overall: input.overall,
    runtime: {
      lifecycle: input.overall === "healthy" ? "running" : "degraded",
      health: input.overall === "healthy" ? "healthy" : "unhealthy",
      observedAt: input.observedAt,
    },
    healthPolicy: {
      status: "configured",
      enabled: true,
      type: "http",
      path: "/health",
      expectedStatusCode: 200,
    },
    publicAccess: {
      status: input.overall === "healthy" ? "ready" : "failed",
    },
    proxy: {
      status: input.overall === "healthy" ? "ready" : "failed",
    },
    checks: [],
    sourceErrors: [],
  };
}

class InMemoryResourceHealthHistoryReadModel implements ResourceHealthObservationHistoryReadModel {
  readonly inputs: ResourceHealthHistoryReadInput[] = [];

  constructor(private readonly summaries: ResourceHealthSummary[]) {}

  async listObservations(
    _context: ExecutionContext,
    input: ResourceHealthHistoryReadInput,
  ): Promise<Result<ResourceHealthHistoryReadResult>> {
    this.inputs.push(input);
    return ok({
      observations: this.summaries
        .filter(
          (item) =>
            item.resourceId === input.resourceId &&
            (item.observedAt ?? item.generatedAt) >= input.window.from &&
            (item.observedAt ?? item.generatedAt) <= input.window.to,
        )
        .slice(0, input.limit)
        .map((item, index) => ({
          observationId: `rho_${index + 1}`,
          observedAt: item.observedAt ?? item.generatedAt,
          overall: item.overall,
          runtimeLifecycle: item.runtime.lifecycle,
          runtimeHealth: item.runtime.health,
          publicAccessStatus: item.publicAccess.status,
          proxyStatus: item.proxy.status,
          healthPolicyStatus: item.healthPolicy.status,
          summary: item,
        })),
      sourceErrors: [],
    });
  }
}

describe("ResourceHealthHistoryQueryService", () => {
  test("[RES-HEALTH-HIST-001] lists retained health observations without invoking live probes or mutation", async () => {
    const readModel = new InMemoryResourceHealthHistoryReadModel([
      summary({
        resourceId: "res_api",
        observedAt: "2026-01-01T00:01:00.000Z",
        overall: "healthy",
      }),
      summary({
        resourceId: "res_api",
        observedAt: "2026-01-01T00:02:00.000Z",
        overall: "unhealthy",
      }),
    ]);
    const service = new ResourceHealthHistoryQueryService(readModel, fixedClock);
    const query = unwrap(
      ResourceHealthHistoryQuery.create({
        resourceId: "res_api",
        window: {
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-01-01T00:05:00.000Z",
        },
        limit: 10,
      }),
    );

    const result = unwrap(await service.execute(createTestContext(), query));

    expect(result).toMatchObject({
      schemaVersion: "resources.health-history/v1",
      resourceId: "res_api",
      generatedAt: "2026-01-01T00:10:00.000Z",
    });
    expect(result.observations.map((observation) => observation.overall)).toEqual([
      "healthy",
      "unhealthy",
    ]);
    expect(readModel.inputs).toEqual([
      {
        resourceId: "res_api",
        window: {
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-01-01T00:05:00.000Z",
        },
        limit: 10,
      },
    ]);
  });

  test("[RES-HEALTH-HIST-002] rejects unbounded or inverted windows before dispatch", () => {
    const result = ResourceHealthHistoryQuery.create({
      resourceId: "res_api",
      window: {
        from: "2026-01-02T00:00:00.000Z",
        to: "2026-01-01T00:00:00.000Z",
      },
    });

    expect(result.isErr()).toBe(true);
  });
});
