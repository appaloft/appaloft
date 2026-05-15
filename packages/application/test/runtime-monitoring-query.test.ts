import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { ok, type Result } from "@appaloft/core";

import {
  createExecutionContext,
  type ExecutionContext,
  ListRuntimeMonitoringSamplesQuery,
  type RuntimeMonitoringDeploymentMarker,
  RuntimeMonitoringRollupQuery,
  RuntimeMonitoringRollupQueryService,
  type RuntimeMonitoringSample,
  type RuntimeMonitoringSampleReadModel,
  RuntimeMonitoringSamplesQueryService,
  type RuntimeMonitoringSamplesReadInput,
  type RuntimeMonitoringSamplesReadResult,
  type RuntimeMonitoringScope,
  type RuntimeMonitoringWindow,
} from "../src";

function unwrap<T>(result: Result<T>): T {
  expect(result.isOk()).toBe(true);
  return result._unsafeUnwrap();
}

function createTestContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_runtime_monitoring",
    entrypoint: "system",
  });
}

const fixedClock = {
  now: () => "2026-01-01T00:10:00.000Z",
};

function sample(input: {
  id: string;
  observedAt: string;
  scope: RuntimeMonitoringScope;
  cpu?: number;
  memoryBytes?: number;
  diskBytes?: number;
}): RuntimeMonitoringSample {
  return {
    sampleId: input.id,
    observedAt: input.observedAt,
    collectedAt: input.observedAt,
    scopeEvidence: {
      scope: input.scope,
      ...(input.scope.kind === "server" ? { serverId: input.scope.serverId } : {}),
      ...(input.scope.kind === "resource" ? { resourceId: input.scope.resourceId } : {}),
      ...(input.scope.kind === "deployment" ? { deploymentId: input.scope.deploymentId } : {}),
    },
    totals: {
      ...(input.cpu ? { cpu: { containerCpuPercent: input.cpu } } : {}),
      ...(input.memoryBytes ? { memory: { containerUsedBytes: input.memoryBytes } } : {}),
      ...(input.diskBytes ? { disk: { attributedBytes: input.diskBytes } } : {}),
    },
    freshness: "recent-sample",
    partial: false,
    labels: {
      providerKey: "generic-ssh",
    },
    warnings: [],
    sourceErrors: [],
  };
}

class InMemoryRuntimeMonitoringSampleReadModel implements RuntimeMonitoringSampleReadModel {
  readonly inputs: RuntimeMonitoringSamplesReadInput[] = [];

  constructor(private readonly samples: RuntimeMonitoringSample[]) {}

  async listSamples(
    _context: ExecutionContext,
    input: RuntimeMonitoringSamplesReadInput,
  ): Promise<Result<RuntimeMonitoringSamplesReadResult>> {
    this.inputs.push(input);
    return ok({
      retention: {
        rawRetentionHours: 24,
        retainedFrom: "2026-01-01T00:00:00.000Z",
        retainedTo: "2026-01-01T01:00:00.000Z",
      },
      samples: this.samples,
      warnings: [],
      sourceErrors: [],
    });
  }
}

class InMemoryRuntimeMonitoringMarkerReadModel {
  readonly inputs: Array<{ scope: RuntimeMonitoringScope; window: RuntimeMonitoringWindow }> = [];

  constructor(private readonly markers: RuntimeMonitoringDeploymentMarker[]) {}

  async listDeploymentMarkers(
    _context: ExecutionContext,
    input: { scope: RuntimeMonitoringScope; window: RuntimeMonitoringWindow },
  ): Promise<Result<RuntimeMonitoringDeploymentMarker[]>> {
    this.inputs.push(input);
    return ok(this.markers);
  }
}

describe("runtime monitoring query boundary", () => {
  test("[RT-MON-003] samples.list returns a bounded sanitized sample window from the read model", async () => {
    const readModel = new InMemoryRuntimeMonitoringSampleReadModel([
      sample({
        id: "rms_one",
        observedAt: "2026-01-01T00:00:00.000Z",
        scope: { kind: "resource", resourceId: "res_api" },
        cpu: 12,
      }),
    ]);
    const service = new RuntimeMonitoringSamplesQueryService(readModel, fixedClock);
    const query = unwrap(
      ListRuntimeMonitoringSamplesQuery.create({
        scope: { kind: "resource", resourceId: "res_api" },
        window: {
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-01-01T01:00:00.000Z",
        },
        signals: ["cpu"],
      }),
    );

    const result = unwrap(await service.execute(createTestContext(), query));

    expect(readModel.inputs).toEqual([
      {
        scope: { kind: "resource", resourceId: "res_api" },
        window: {
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-01-01T01:00:00.000Z",
        },
        signals: ["cpu"],
        limit: 300,
      },
    ]);
    expect(result).toMatchObject({
      schemaVersion: "runtime-monitoring.samples.list/v1",
      scope: { kind: "resource", resourceId: "res_api" },
      generatedAt: "2026-01-01T00:10:00.000Z",
      freshness: "recent-sample",
      partial: false,
      samples: [
        {
          sampleId: "rms_one",
          labels: {
            providerKey: "generic-ssh",
          },
        },
      ],
    });
  });

  test("[RT-MON-003] samples.list rejects unbounded windows before dispatch", () => {
    const result = ListRuntimeMonitoringSamplesQuery.create({
      scope: { kind: "server", serverId: "srv_primary" },
      window: {
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-03T00:00:00.000Z",
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("validation_error");
  });

  test("[RT-MON-002][RT-MON-004] rollup reads retained samples and deployment markers without claiming causality", async () => {
    const readModel = new InMemoryRuntimeMonitoringSampleReadModel([
      sample({
        id: "rms_one",
        observedAt: "2026-01-01T00:00:10.000Z",
        scope: { kind: "deployment", deploymentId: "dep_one" },
        cpu: 10,
        memoryBytes: 128,
      }),
      sample({
        id: "rms_two",
        observedAt: "2026-01-01T00:00:40.000Z",
        scope: { kind: "deployment", deploymentId: "dep_one" },
        cpu: 15,
        memoryBytes: 256,
      }),
    ]);
    const markerReadModel = new InMemoryRuntimeMonitoringMarkerReadModel([
      {
        deploymentId: "dep_one",
        resourceId: "res_api",
        environmentId: "env_prod",
        observedAt: "2026-01-01T00:00:05.000Z",
        status: "succeeded",
        label: "Deployment dep_one succeeded",
        correlation: "time",
      },
    ]);
    const service = new RuntimeMonitoringRollupQueryService(readModel, markerReadModel, fixedClock);
    const query = unwrap(
      RuntimeMonitoringRollupQuery.create({
        scope: { kind: "resource", resourceId: "res_api" },
        window: {
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-01-01T00:05:00.000Z",
        },
        bucket: "minute",
        signals: ["cpu", "memory"],
      }),
    );

    const result = unwrap(await service.execute(createTestContext(), query));

    expect(readModel.inputs).toHaveLength(1);
    expect(markerReadModel.inputs).toHaveLength(1);
    expect(result).toMatchObject({
      schemaVersion: "runtime-monitoring.rollup/v1",
      scope: { kind: "resource", resourceId: "res_api" },
      bucket: "minute",
      freshness: "recent-sample",
      partial: false,
      deploymentMarkers: [
        {
          deploymentId: "dep_one",
          correlation: "time",
        },
      ],
    });
    const cpuSeries = result.series.find((series) => series.signal === "cpu");
    const memorySeries = result.series.find((series) => series.signal === "memory");
    expect(cpuSeries?.points[0]).toMatchObject({
      sampleCount: 2,
      totals: {
        cpu: {
          containerCpuPercent: 25,
        },
      },
    });
    expect(memorySeries?.points[0]).toMatchObject({
      sampleCount: 2,
      totals: {
        memory: {
          containerUsedBytes: 384,
        },
      },
    });
    expect(result.topContributors).toEqual([
      expect.objectContaining({
        scope: { kind: "deployment", deploymentId: "dep_one" },
        sampleCount: 2,
      }),
    ]);
  });

  test("[RT-MON-009] project rollups stay shallow and sort top contributors by retained usage", async () => {
    const readModel = new InMemoryRuntimeMonitoringSampleReadModel([
      sample({
        id: "rms_web",
        observedAt: "2026-01-01T00:01:00.000Z",
        scope: { kind: "resource", resourceId: "res_web" },
        memoryBytes: 1024,
      }),
      sample({
        id: "rms_worker",
        observedAt: "2026-01-01T00:02:00.000Z",
        scope: { kind: "resource", resourceId: "res_worker" },
        diskBytes: 4096,
      }),
    ]);
    const markerReadModel = new InMemoryRuntimeMonitoringMarkerReadModel([]);
    const service = new RuntimeMonitoringRollupQueryService(readModel, markerReadModel, fixedClock);
    const query = unwrap(
      RuntimeMonitoringRollupQuery.create({
        scope: { kind: "project", projectId: "prj_demo" },
        window: {
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-01-01T00:05:00.000Z",
        },
        bucket: "minute",
        includeDeploymentMarkers: false,
      }),
    );

    const result = unwrap(await service.execute(createTestContext(), query));

    expect(readModel.inputs).toEqual([
      {
        scope: { kind: "project", projectId: "prj_demo" },
        window: {
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-01-01T00:05:00.000Z",
        },
        limit: 720,
      },
    ]);
    expect(markerReadModel.inputs).toHaveLength(0);
    expect(result.scope).toEqual({ kind: "project", projectId: "prj_demo" });
    expect(result.topContributors.map((entry) => entry.scope)).toEqual([
      { kind: "resource", resourceId: "res_worker" },
      { kind: "resource", resourceId: "res_web" },
    ]);
    expect(result.topContributors).not.toContainEqual(
      expect.objectContaining({
        scope: { kind: "project", projectId: "prj_demo" },
      }),
    );
    expect(result.deploymentMarkers).toEqual([]);
  });
});
