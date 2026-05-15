import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { ok, type Result } from "@appaloft/core";

import {
  ConfigureRuntimeMonitoringThresholdsCommand,
  ConfigureRuntimeMonitoringThresholdsUseCase,
  createExecutionContext,
  type ExecutionContext,
  type RepositoryContext,
  type RuntimeMonitoringSample,
  type RuntimeMonitoringSampleReadModel,
  type RuntimeMonitoringSamplesReadInput,
  type RuntimeMonitoringSamplesReadResult,
  type RuntimeMonitoringScope,
  type RuntimeMonitoringThresholdPolicyRecord,
  type RuntimeMonitoringThresholdPolicyRepository,
  ShowRuntimeMonitoringThresholdsQuery,
  ShowRuntimeMonitoringThresholdsQueryService,
  toRepositoryContext,
} from "../src";

function unwrap<T>(result: Result<T>): T {
  expect(result.isOk()).toBe(true);
  return result._unsafeUnwrap();
}

function createTestContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_runtime_monitoring_thresholds",
    entrypoint: "system",
    actor: {
      kind: "user",
      id: "usr_ops",
    },
  });
}

const fixedClock = {
  now: () => "2026-01-01T01:00:00.000Z",
};

const fixedIds = {
  next(prefix: string): string {
    return `${prefix}_generated`;
  },
};

function sample(input: {
  id: string;
  observedAt: string;
  scope: RuntimeMonitoringScope;
  evidence?: Partial<RuntimeMonitoringSample["scopeEvidence"]>;
  memoryUsedBytes?: number;
  diskUsedBytes?: number;
  freshness?: RuntimeMonitoringSample["freshness"];
}): RuntimeMonitoringSample {
  return {
    sampleId: input.id,
    observedAt: input.observedAt,
    collectedAt: input.observedAt,
    scopeEvidence: {
      scope: input.scope,
      ...(input.scope.kind === "resource" ? { resourceId: input.scope.resourceId } : {}),
      ...input.evidence,
    },
    totals: {
      ...(input.memoryUsedBytes !== undefined
        ? { memory: { usedBytes: input.memoryUsedBytes } }
        : {}),
      ...(input.diskUsedBytes !== undefined ? { disk: { usedBytes: input.diskUsedBytes } } : {}),
    },
    freshness: input.freshness ?? "recent-sample",
    partial: false,
    labels: {
      providerKey: "generic-ssh",
    },
    warnings: [],
    sourceErrors: [],
  };
}

class InMemoryThresholdPolicyRepository implements RuntimeMonitoringThresholdPolicyRepository {
  readonly records = new Map<string, RuntimeMonitoringThresholdPolicyRecord>();

  async upsert(
    _context: RepositoryContext,
    record: RuntimeMonitoringThresholdPolicyRecord,
  ): Promise<Result<RuntimeMonitoringThresholdPolicyRecord>> {
    this.records.set(record.policyId, record);
    return ok(record);
  }

  async findOne(
    _context: RepositoryContext,
    input: { policyId?: string; scope?: RuntimeMonitoringScope },
  ): Promise<Result<RuntimeMonitoringThresholdPolicyRecord | null>> {
    if (input.policyId) {
      return ok(this.records.get(input.policyId) ?? null);
    }
    if (!input.scope) {
      return ok(null);
    }
    return ok(
      [...this.records.values()].find(
        (record) => JSON.stringify(record.scope) === JSON.stringify(input.scope),
      ) ?? null,
    );
  }
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
        retainedTo: "2026-01-02T00:00:00.000Z",
      },
      samples: this.samples,
      warnings: [],
      sourceErrors: [],
    });
  }
}

describe("runtime monitoring thresholds boundary", () => {
  test("[RT-MON-006] configure persists a safe exact-scope threshold policy", async () => {
    const repository = new InMemoryThresholdPolicyRepository();
    const useCase = new ConfigureRuntimeMonitoringThresholdsUseCase(
      repository,
      fixedClock,
      fixedIds,
    );
    const command = unwrap(
      ConfigureRuntimeMonitoringThresholdsCommand.create({
        scope: { kind: "resource", resourceId: "res_api" },
        rules: [
          {
            signal: "memory",
            metric: "usedBytes",
            warning: 1024,
            critical: 2048,
          },
        ],
      }),
    );

    const result = unwrap(await useCase.execute(createTestContext(), command.input));

    expect(result.policy).toEqual({
      schemaVersion: "runtime-monitoring-thresholds.policy/v1",
      policyId: "rmtp_generated",
      scope: { kind: "resource", resourceId: "res_api" },
      rules: [
        {
          ruleId: "rmtr_generated",
          signal: "memory",
          metric: "usedBytes",
          warning: 1024,
          critical: 2048,
          comparator: "greater-than-or-equal",
        },
      ],
      enabled: true,
      updatedAt: "2026-01-01T01:00:00.000Z",
      updatedByActorId: "usr_ops",
      updatedByActorKind: "user",
    });
  });

  test("[RT-MON-006] threshold command validation rejects signal mismatches", () => {
    const result = ConfigureRuntimeMonitoringThresholdsCommand.create({
      scope: { kind: "resource", resourceId: "res_api" },
      rules: [
        {
          signal: "memory",
          metric: "attributedBytes",
          warning: 1,
        },
      ],
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("validation_error");
  });

  test("[RT-MON-006] threshold command validation rejects inverted severities", () => {
    const result = ConfigureRuntimeMonitoringThresholdsCommand.create({
      scope: { kind: "resource", resourceId: "res_api" },
      rules: [
        {
          signal: "disk",
          metric: "usedBytes",
          warning: 200,
          critical: 100,
        },
      ],
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("validation_error");
  });

  test("[RT-MON-006] show evaluates the latest exact-scope retained sample without runtime mutation", async () => {
    const scope: RuntimeMonitoringScope = { kind: "resource", resourceId: "res_api" };
    const repository = new InMemoryThresholdPolicyRepository();
    await repository.upsert(toRepositoryContext(createTestContext()), {
      policyId: "rmtp_res_api",
      scope,
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
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const readModel = new InMemoryRuntimeMonitoringSampleReadModel([
      sample({
        id: "rms_old",
        observedAt: "2026-01-01T00:05:00.000Z",
        scope,
        diskUsedBytes: 99,
      }),
      sample({
        id: "rms_latest",
        observedAt: "2026-01-01T00:55:00.000Z",
        scope,
        memoryUsedBytes: 5000,
        diskUsedBytes: 250,
      }),
    ]);
    const service = new ShowRuntimeMonitoringThresholdsQueryService(
      repository,
      readModel,
      fixedClock,
    );
    const query = unwrap(ShowRuntimeMonitoringThresholdsQuery.create({ scope }));

    const result = unwrap(await service.execute(createTestContext(), query.input));

    expect(readModel.inputs).toEqual([
      {
        scope,
        window: {
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-01-01T01:00:00.000Z",
        },
        limit: 720,
      },
    ]);
    expect(result.evaluation).toMatchObject({
      state: "critical",
      evaluatedAt: "2026-01-01T00:55:00.000Z",
      sourceSampleId: "rms_latest",
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
      nextActions: [
        "open-runtime-monitoring",
        "inspect-runtime-usage",
        "inspect-capacity",
        "review-runtime-logs",
        "review-deployment-events",
      ],
    });
  });

  test("[RT-MON-006] show inherits the nearest threshold policy from retained scope evidence", async () => {
    const scope: RuntimeMonitoringScope = { kind: "resource", resourceId: "res_api" };
    const repository = new InMemoryThresholdPolicyRepository();
    await repository.upsert(toRepositoryContext(createTestContext()), {
      policyId: "rmtp_project",
      scope: { kind: "project", projectId: "prj_ops" },
      rules: [
        {
          ruleId: "rmtr_project_disk",
          signal: "disk",
          metric: "usedBytes",
          critical: 900,
          comparator: "greater-than-or-equal",
        },
      ],
      enabled: true,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await repository.upsert(toRepositoryContext(createTestContext()), {
      policyId: "rmtp_environment",
      scope: { kind: "environment", environmentId: "env_prod" },
      rules: [
        {
          ruleId: "rmtr_environment_memory",
          signal: "memory",
          metric: "usedBytes",
          warning: 400,
          critical: 800,
          comparator: "greater-than-or-equal",
        },
      ],
      enabled: true,
      updatedAt: "2026-01-01T00:10:00.000Z",
    });
    const readModel = new InMemoryRuntimeMonitoringSampleReadModel([
      sample({
        id: "rms_latest",
        observedAt: "2026-01-01T00:55:00.000Z",
        scope,
        evidence: {
          serverId: "srv_one",
          projectId: "prj_ops",
          environmentId: "env_prod",
        },
        memoryUsedBytes: 850,
        diskUsedBytes: 950,
      }),
    ]);
    const service = new ShowRuntimeMonitoringThresholdsQueryService(
      repository,
      readModel,
      fixedClock,
    );
    const query = unwrap(ShowRuntimeMonitoringThresholdsQuery.create({ scope }));

    const result = unwrap(await service.execute(createTestContext(), query.input));

    expect(result.scope).toEqual(scope);
    expect(result.policy?.policyId).toBe("rmtp_environment");
    expect(result.policy?.scope).toEqual({ kind: "environment", environmentId: "env_prod" });
    expect(result.evaluation).toMatchObject({
      state: "critical",
      crossed: [
        {
          ruleId: "rmtr_environment_memory",
          signal: "memory",
          metric: "usedBytes",
          severity: "critical",
          observedValue: 850,
          boundary: 800,
        },
      ],
    });
  });

  test("[RT-MON-006] exact-scope threshold policies override inherited parent policies", async () => {
    const scope: RuntimeMonitoringScope = { kind: "resource", resourceId: "res_api" };
    const repository = new InMemoryThresholdPolicyRepository();
    await repository.upsert(toRepositoryContext(createTestContext()), {
      policyId: "rmtp_environment",
      scope: { kind: "environment", environmentId: "env_prod" },
      rules: [
        {
          ruleId: "rmtr_environment_memory",
          signal: "memory",
          metric: "usedBytes",
          critical: 800,
          comparator: "greater-than-or-equal",
        },
      ],
      enabled: true,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await repository.upsert(toRepositoryContext(createTestContext()), {
      policyId: "rmtp_resource",
      scope,
      rules: [
        {
          ruleId: "rmtr_resource_memory",
          signal: "memory",
          metric: "usedBytes",
          critical: 1_000,
          comparator: "greater-than-or-equal",
        },
      ],
      enabled: true,
      updatedAt: "2026-01-01T00:10:00.000Z",
    });
    const service = new ShowRuntimeMonitoringThresholdsQueryService(
      repository,
      new InMemoryRuntimeMonitoringSampleReadModel([
        sample({
          id: "rms_latest",
          observedAt: "2026-01-01T00:55:00.000Z",
          scope,
          evidence: {
            projectId: "prj_ops",
            environmentId: "env_prod",
          },
          memoryUsedBytes: 900,
        }),
      ]),
      fixedClock,
    );
    const query = unwrap(ShowRuntimeMonitoringThresholdsQuery.create({ scope }));

    const result = unwrap(await service.execute(createTestContext(), query.input));

    expect(result.policy?.policyId).toBe("rmtp_resource");
    expect(result.evaluation).toMatchObject({
      state: "ok",
      crossed: [],
    });
  });

  test("[RT-MON-006] show returns unknown when no threshold policy exists", async () => {
    const service = new ShowRuntimeMonitoringThresholdsQueryService(
      new InMemoryThresholdPolicyRepository(),
      new InMemoryRuntimeMonitoringSampleReadModel([]),
      fixedClock,
    );
    const query = unwrap(
      ShowRuntimeMonitoringThresholdsQuery.create({
        scope: { kind: "resource", resourceId: "res_missing" },
      }),
    );

    const result = unwrap(await service.execute(createTestContext(), query.input));

    expect(result.policy).toBeNull();
    expect(result.evaluation).toMatchObject({
      state: "unknown",
      crossed: [],
      nextActions: ["configure-thresholds"],
    });
  });

  test("[RT-MON-006] disabled policies read back without warning or critical crossings", async () => {
    const scope: RuntimeMonitoringScope = { kind: "resource", resourceId: "res_api" };
    const repository = new InMemoryThresholdPolicyRepository();
    await repository.upsert(toRepositoryContext(createTestContext()), {
      policyId: "rmtp_disabled",
      scope,
      rules: [
        {
          ruleId: "rmtr_memory",
          signal: "memory",
          metric: "usedBytes",
          critical: 1,
          comparator: "greater-than-or-equal",
        },
      ],
      enabled: false,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const service = new ShowRuntimeMonitoringThresholdsQueryService(
      repository,
      new InMemoryRuntimeMonitoringSampleReadModel([
        sample({
          id: "rms_latest",
          observedAt: "2026-01-01T00:55:00.000Z",
          scope,
          memoryUsedBytes: 5000,
        }),
      ]),
      fixedClock,
    );
    const query = unwrap(ShowRuntimeMonitoringThresholdsQuery.create({ scope }));

    const result = unwrap(await service.execute(createTestContext(), query.input));

    expect(result.policy?.enabled).toBe(false);
    expect(result.evaluation).toMatchObject({
      state: "unknown",
      crossed: [],
      nextActions: ["configure-thresholds"],
    });
  });
});
