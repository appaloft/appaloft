import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { FixedClock, SequenceIdGenerator as TestSequenceIdGenerator } from "@appaloft/testkit";
import {
  type InspectRuntimeUsageQuery,
  type ProcessAttemptClaimer,
  type ProcessAttemptClaimInput,
  type ProcessAttemptClaimResult,
  type ProcessAttemptCompleter,
  type ProcessAttemptCompletionInput,
  type ProcessAttemptCompletionResult,
  type ProcessAttemptRecord,
  type ProcessAttemptRecorder,
  RuntimeMonitoringCollectorService,
  type RuntimeMonitoringSample,
  type RuntimeMonitoringSampleRecord,
  type RuntimeMonitoringSampleWriteStore,
  type RuntimeUsageInspection,
} from "../src";
import {
  createExecutionContext,
  type ExecutionContext,
  type RepositoryContext,
} from "../src/execution-context";

class RecordingRuntimeUsageInspectionQueryService
  implements Pick<RuntimeUsageInspectionQueryServiceLike, "execute">
{
  readonly inputs: InspectRuntimeUsageQuery["input"][] = [];

  constructor(private readonly result: Result<RuntimeUsageInspection>) {}

  async execute(
    _context: ExecutionContext,
    query: InspectRuntimeUsageQuery,
  ): Promise<Result<RuntimeUsageInspection>> {
    this.inputs.push(query.input);
    return this.result;
  }
}

interface RuntimeUsageInspectionQueryServiceLike {
  execute(
    context: ExecutionContext,
    query: InspectRuntimeUsageQuery,
  ): Promise<Result<RuntimeUsageInspection>>;
}

class RecordingRuntimeMonitoringSampleWriteStore implements RuntimeMonitoringSampleWriteStore {
  readonly samples: RuntimeMonitoringSampleRecord[] = [];

  constructor(private readonly result?: Result<RuntimeMonitoringSample>) {}

  async record(
    _context: RepositoryContext,
    sample: RuntimeMonitoringSampleRecord,
  ): Promise<Result<RuntimeMonitoringSample>> {
    this.samples.push(sample);
    return this.result ?? ok(sample);
  }
}

class MemoryProcessAttemptRecorder implements ProcessAttemptRecorder {
  readonly attempts: ProcessAttemptRecord[] = [];

  async record(
    _context: RepositoryContext,
    attempt: ProcessAttemptRecord,
  ): Promise<Result<ProcessAttemptRecord>> {
    this.attempts.push(attempt);
    return ok(attempt);
  }
}

class RecordingProcessAttemptClaimer implements ProcessAttemptClaimer {
  readonly claims: ProcessAttemptClaimInput[] = [];

  async claimDue(
    _context: RepositoryContext,
    input: ProcessAttemptClaimInput,
  ): Promise<Result<ProcessAttemptClaimResult>> {
    this.claims.push(input);
    return ok({
      status: "claimed",
      attempt: {
        id: input.attemptId,
        kind: "runtime-maintenance",
        status: "running",
        operationKey: "runtime-monitoring.collect",
        updatedAt: input.claimedAt,
        nextActions: ["no-action"],
      },
    });
  }
}

class RecordingProcessAttemptCompleter implements ProcessAttemptCompleter {
  readonly completions: ProcessAttemptCompletionInput[] = [];

  async complete(
    _context: RepositoryContext,
    input: ProcessAttemptCompletionInput,
  ): Promise<Result<ProcessAttemptCompletionResult>> {
    this.completions.push(input);
    return ok({
      status: "completed",
      attempt: {
        id: input.attemptId,
        kind: "runtime-maintenance",
        status: input.status,
        operationKey: "runtime-monitoring.collect",
        updatedAt: input.completedAt,
        nextActions: input.nextActions,
      },
    });
  }
}

function inspection(overrides: Partial<RuntimeUsageInspection> = {}): RuntimeUsageInspection {
  return {
    schemaVersion: "runtime-usage.inspect/v1",
    scope: { kind: "resource", resourceId: "res_api" },
    generatedAt: "2026-02-01T00:00:01.000Z",
    observedAt: "2026-02-01T00:00:00.000Z",
    freshness: "live",
    partial: false,
    totals: {
      cpu: { containerCpuPercent: 17 },
      memory: { containerUsedBytes: 2048 },
      disk: { attributedBytes: 4096 },
    },
    byProject: [],
    byEnvironment: [],
    byResource: [],
    byDeployment: [],
    artifacts: [
      {
        kind: "active-runtime",
        ownership: "attributed",
        serverId: "srv_primary",
        projectId: "prj_demo",
        environmentId: "env_prod",
        resourceId: "res_api",
        deploymentId: "dep_api",
        runtimeId: "run_api",
        bytes: 4096,
        observedAt: "2026-02-01T00:00:00.000Z",
        evidence: [{ source: "label", key: "appaloft.resource=res_api" }],
        reclaimable: "no",
        warnings: [],
      },
    ],
    warnings: [
      {
        code: "partial-diagnostic",
        message: "Network usage source is unavailable.",
        resource: "network",
      },
    ],
    sourceErrors: [
      {
        source: "docker",
        code: "docker_stats_unavailable",
        message: "Docker stats could not be read.",
        retriable: true,
      },
    ],
    ...overrides,
  };
}

function createService(input: {
  queryService: RecordingRuntimeUsageInspectionQueryService;
  sampleWriteStore?: RecordingRuntimeMonitoringSampleWriteStore;
  recorder?: MemoryProcessAttemptRecorder;
  claimer?: RecordingProcessAttemptClaimer;
  completer?: RecordingProcessAttemptCompleter;
}) {
  const sampleWriteStore =
    input.sampleWriteStore ?? new RecordingRuntimeMonitoringSampleWriteStore();
  const recorder = input.recorder ?? new MemoryProcessAttemptRecorder();
  const claimer = input.claimer ?? new RecordingProcessAttemptClaimer();
  const completer = input.completer ?? new RecordingProcessAttemptCompleter();
  const service = new RuntimeMonitoringCollectorService(
    input.queryService,
    sampleWriteStore,
    recorder,
    claimer,
    completer,
    new TestSequenceIdGenerator(),
    new FixedClock("2026-02-01T00:00:05.000Z"),
  );
  return { service, sampleWriteStore, recorder, claimer, completer };
}

describe("runtime monitoring collector", () => {
  test("[RT-MON-001][PROC-DELIVERY-001][PROC-DELIVERY-002] records sanitized samples with process visibility", async () => {
    const queryService = new RecordingRuntimeUsageInspectionQueryService(ok(inspection()));
    const { service, sampleWriteStore, recorder, claimer, completer } = createService({
      queryService,
    });
    const context = createExecutionContext({
      requestId: "req_runtime_monitoring_collect",
      entrypoint: "system",
    });

    const result = await service.run(context, {
      scope: { kind: "resource", resourceId: "res_api" },
      rawRetentionHours: 6,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      schemaVersion: "runtime-monitoring.collect/v1",
      processAttemptId: "wrk_0001",
      sampleId: "rms_0002",
      scope: { kind: "resource", resourceId: "res_api" },
      observedAt: "2026-02-01T00:00:00.000Z",
      collectedAt: "2026-02-01T00:00:05.000Z",
      retainedUntil: "2026-02-01T06:00:00.000Z",
      partial: false,
      warningCount: 1,
      sourceErrorCount: 1,
    });
    expect(queryService.inputs).toEqual([
      {
        scope: { kind: "resource", resourceId: "res_api" },
        mode: "current",
        includeArtifacts: true,
        includeWarnings: true,
      },
    ]);
    expect(sampleWriteStore.samples).toHaveLength(1);
    expect(sampleWriteStore.samples[0]).toMatchObject({
      sampleId: "rms_0002",
      observedAt: "2026-02-01T00:00:00.000Z",
      collectedAt: "2026-02-01T00:00:05.000Z",
      retainedUntil: "2026-02-01T06:00:00.000Z",
      scopeEvidence: {
        scope: { kind: "resource", resourceId: "res_api" },
        serverId: "srv_primary",
        projectId: "prj_demo",
        environmentId: "env_prod",
        resourceId: "res_api",
        deploymentId: "dep_api",
      },
      totals: {
        cpu: { containerCpuPercent: 17 },
        memory: { containerUsedBytes: 2048 },
        disk: { attributedBytes: 4096 },
      },
      labels: {
        artifactKind: "active-runtime",
        runtimeId: "run_api",
      },
      warnings: [
        {
          code: "partial-window",
          message: "Network usage source is unavailable.",
          signal: "network",
        },
      ],
      sourceErrors: [
        {
          source: "collector",
          code: "docker_stats_unavailable",
          message: "Docker stats could not be read.",
          retriable: true,
        },
      ],
    });
    expect(recorder.attempts[0]).toMatchObject({
      id: "wrk_0001",
      kind: "runtime-maintenance",
      operationKey: "runtime-monitoring.collect",
      status: "pending",
      resourceId: "res_api",
      safeDetails: {
        scopeKind: "resource",
        scopeId: "res_api",
        rawRetentionHours: 6,
      },
    });
    expect(claimer.claims).toHaveLength(1);
    expect(completer.completions[0]).toMatchObject({
      attemptId: "wrk_0001",
      status: "succeeded",
      step: "sample-record",
      safeDetails: {
        sampleId: "rms_0002",
        observedAt: "2026-02-01T00:00:00.000Z",
        retainedUntil: "2026-02-01T06:00:00.000Z",
        warningCount: 1,
        sourceErrorCount: 1,
      },
    });
  });

  test("[RT-MON-001][PROC-DELIVERY-004] records retry-scheduled visibility when inspection fails", async () => {
    const queryService = new RecordingRuntimeUsageInspectionQueryService(
      err(
        domainError.infra("runtime usage inspection failed", {
          phase: "runtime-monitoring-collector-test",
        }),
      ),
    );
    const { service, sampleWriteStore, completer } = createService({ queryService });
    const context = createExecutionContext({
      requestId: "req_runtime_monitoring_collect_failure",
      entrypoint: "system",
    });

    const result = await service.run(context, {
      scope: { kind: "server", serverId: "srv_primary" },
    });

    expect(result.isErr()).toBe(true);
    expect(sampleWriteStore.samples).toHaveLength(0);
    expect(completer.completions[0]).toMatchObject({
      attemptId: "wrk_0001",
      status: "retry-scheduled",
      step: "runtime-usage.inspect",
      errorCode: "infra_error",
      errorCategory: "infra",
      retriable: true,
      nextEligibleAt: "2026-02-01T00:00:05.000Z",
      nextActions: ["retry", "manual-review"],
      safeDetails: {
        scopeKind: "server",
        scopeId: "srv_primary",
        rawRetentionHours: 24,
      },
    });
  });
});
