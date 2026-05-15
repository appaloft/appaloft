import { domainError, err, ok, type Result, safeTry } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type IdGenerator,
  type ProcessAttemptClaimer,
  type ProcessAttemptCompleter,
  type ProcessAttemptRecorder,
  type RuntimeArtifactUsage,
  type RuntimeMonitoringSafeLabels,
  type RuntimeMonitoringSampleRecord,
  type RuntimeMonitoringSampleWriteStore,
  type RuntimeMonitoringScope,
  type RuntimeMonitoringScopeEvidence,
  type RuntimeMonitoringSignal,
  type RuntimeMonitoringSourceError,
  type RuntimeMonitoringWarning,
  type RuntimeUsageInspection,
  type RuntimeUsageScope,
  type RuntimeUsageSourceError,
  type RuntimeUsageWarning,
} from "../../ports";
import { tokens } from "../../tokens";
import { InspectRuntimeUsageQuery } from "../runtime-usage/inspect-runtime-usage.query";
import { type RuntimeUsageInspectionQueryService } from "../runtime-usage/inspect-runtime-usage.query-service";

export const runtimeMonitoringCollectorOperationKey = "runtime-monitoring.collect";
export const runtimeMonitoringCollectorWorkerId = "runtime-monitoring-collector-worker";
export const runtimeMonitoringCollectorWorkKind = "runtime-maintenance";
export const defaultRuntimeMonitoringRawRetentionHours = 24;

export interface RuntimeMonitoringCollectorRunInput {
  scope: RuntimeMonitoringScope;
  scheduledAt?: string;
  rawRetentionHours?: number;
  collectionProfile?: "full" | "attribution";
}

export interface RuntimeMonitoringCollectorRunResult {
  schemaVersion: "runtime-monitoring.collect/v1";
  processAttemptId: string;
  sampleId: string;
  scope: RuntimeMonitoringScope;
  observedAt: string;
  collectedAt: string;
  retainedUntil: string;
  partial: boolean;
  warningCount: number;
  sourceErrorCount: number;
}

function scopeId(scope: RuntimeUsageScope): string {
  switch (scope.kind) {
    case "server":
      return scope.serverId;
    case "project":
      return scope.projectId;
    case "environment":
      return scope.environmentId;
    case "resource":
      return scope.resourceId;
    case "deployment":
      return scope.deploymentId;
  }
}

function safeScopeDetails(scope: RuntimeMonitoringScope): Record<string, string> {
  return {
    scopeKind: scope.kind,
    scopeId: scopeId(scope),
  };
}

function retainedUntilFrom(observedAt: string, rawRetentionHours: number): Result<string> {
  if (!Number.isInteger(rawRetentionHours) || rawRetentionHours < 1) {
    return err(
      domainError.validation("Runtime monitoring retention hours must be a positive integer", {
        phase: "runtime-monitoring-collector",
        rawRetentionHours,
      }),
    );
  }

  const observedTime = Date.parse(observedAt);
  if (!Number.isFinite(observedTime)) {
    return err(
      domainError.validation("Runtime monitoring observed timestamp must be an ISO timestamp", {
        phase: "runtime-monitoring-collector",
        observedAt,
      }),
    );
  }

  return ok(new Date(observedTime + rawRetentionHours * 60 * 60 * 1000).toISOString());
}

function artifactMatchesScope(scope: RuntimeMonitoringScope, artifact: RuntimeArtifactUsage) {
  switch (scope.kind) {
    case "server":
      return artifact.serverId === scope.serverId;
    case "project":
      return artifact.projectId === scope.projectId;
    case "environment":
      return artifact.environmentId === scope.environmentId;
    case "resource":
      return artifact.resourceId === scope.resourceId;
    case "deployment":
      return artifact.deploymentId === scope.deploymentId;
  }
}

function scopeEvidenceFromInspection(
  scope: RuntimeMonitoringScope,
  inspection: RuntimeUsageInspection,
): RuntimeMonitoringScopeEvidence {
  const artifact = inspection.artifacts.find((candidate) => artifactMatchesScope(scope, candidate));
  return {
    scope,
    ...(scope.kind === "server" ? { serverId: scope.serverId } : {}),
    ...(scope.kind === "project" ? { projectId: scope.projectId } : {}),
    ...(scope.kind === "environment" ? { environmentId: scope.environmentId } : {}),
    ...(scope.kind === "resource" ? { resourceId: scope.resourceId } : {}),
    ...(scope.kind === "deployment" ? { deploymentId: scope.deploymentId } : {}),
    ...(artifact?.serverId ? { serverId: artifact.serverId } : {}),
    ...(artifact?.projectId ? { projectId: artifact.projectId } : {}),
    ...(artifact?.environmentId ? { environmentId: artifact.environmentId } : {}),
    ...(artifact?.resourceId ? { resourceId: artifact.resourceId } : {}),
    ...(artifact?.deploymentId ? { deploymentId: artifact.deploymentId } : {}),
  };
}

function signalFromRuntimeUsageWarning(
  warning: RuntimeUsageWarning,
): RuntimeMonitoringSignal | undefined {
  switch (warning.resource) {
    case "cpu":
    case "memory":
    case "disk":
    case "inode":
    case "docker":
    case "network":
      return warning.resource;
    default:
      return undefined;
  }
}

function monitoringWarningCode(warning: RuntimeUsageWarning): RuntimeMonitoringWarning["code"] {
  switch (warning.code) {
    case "stale-observation":
      return "stale-samples";
    case "partial-diagnostic":
      return "partial-window";
    default:
      return "missing-metric-source";
  }
}

function monitoringWarningsFromInspection(
  inspection: RuntimeUsageInspection,
): RuntimeMonitoringWarning[] {
  return inspection.warnings.map((warning) => {
    const signal = signalFromRuntimeUsageWarning(warning);
    return {
      code: monitoringWarningCode(warning),
      message: warning.message,
      ...(signal ? { signal } : {}),
      ...(warning.scope ? { scope: warning.scope } : {}),
    };
  });
}

function monitoringSourceFromUsage(
  sourceError: RuntimeUsageSourceError,
): RuntimeMonitoringSourceError["source"] {
  switch (sourceError.source) {
    case "read-model":
      return "read-model";
    case "unknown":
      return "unknown";
    default:
      return "collector";
  }
}

function monitoringSourceErrorsFromInspection(
  inspection: RuntimeUsageInspection,
): RuntimeMonitoringSourceError[] {
  return inspection.sourceErrors.map((sourceError) => ({
    source: monitoringSourceFromUsage(sourceError),
    code: sourceError.code,
    message: sourceError.message,
    retriable: sourceError.retriable,
  }));
}

function labelsFromInspection(inspection: RuntimeUsageInspection): RuntimeMonitoringSafeLabels {
  const artifact =
    inspection.artifacts.find((candidate) => candidate.kind === "active-runtime") ??
    inspection.artifacts[0];
  return {
    ...(artifact?.kind ? { artifactKind: artifact.kind } : {}),
    ...(artifact?.runtimeId ? { runtimeId: artifact.runtimeId } : {}),
  };
}

function sampleFromInspection(input: {
  sampleId: string;
  scope: RuntimeMonitoringScope;
  inspection: RuntimeUsageInspection;
  collectedAt: string;
  retainedUntil: string;
}): RuntimeMonitoringSampleRecord {
  const observedAt = input.inspection.observedAt ?? input.inspection.generatedAt;
  return {
    sampleId: input.sampleId,
    observedAt,
    collectedAt: input.collectedAt,
    scopeEvidence: scopeEvidenceFromInspection(input.scope, input.inspection),
    totals: input.inspection.totals,
    freshness: input.inspection.freshness,
    partial: input.inspection.partial,
    labels: labelsFromInspection(input.inspection),
    warnings: monitoringWarningsFromInspection(input.inspection),
    sourceErrors: monitoringSourceErrorsFromInspection(input.inspection),
    retainedUntil: input.retainedUntil,
  };
}

@injectable()
export class RuntimeMonitoringCollectorService {
  constructor(
    @inject(tokens.runtimeUsageInspectionQueryService)
    private readonly runtimeUsageInspectionQueryService: Pick<
      RuntimeUsageInspectionQueryService,
      "execute"
    >,
    @inject(tokens.runtimeMonitoringSampleWriteStore)
    private readonly sampleWriteStore: RuntimeMonitoringSampleWriteStore,
    @inject(tokens.processAttemptRecorder)
    private readonly processAttemptRecorder: ProcessAttemptRecorder,
    @inject(tokens.processAttemptClaimer)
    private readonly processAttemptClaimer: ProcessAttemptClaimer,
    @inject(tokens.processAttemptCompleter)
    private readonly processAttemptCompleter: ProcessAttemptCompleter,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async run(
    context: ExecutionContext,
    input: RuntimeMonitoringCollectorRunInput,
  ): Promise<Result<RuntimeMonitoringCollectorRunResult>> {
    const repositoryContext = toRepositoryContext(context);
    const {
      clock,
      idGenerator,
      processAttemptClaimer,
      processAttemptCompleter,
      processAttemptRecorder,
      runtimeUsageInspectionQueryService,
      sampleWriteStore,
    } = this;

    return safeTry(async function* () {
      const scheduledAt = input.scheduledAt ?? clock.now();
      const processAttemptId = idGenerator.next("wrk");
      const sampleId = idGenerator.next("rms");
      const rawRetentionHours =
        input.rawRetentionHours ?? defaultRuntimeMonitoringRawRetentionHours;
      const safeDetails = {
        trigger: "runtime-monitoring-collector",
        operationKey: runtimeMonitoringCollectorOperationKey,
        ...safeScopeDetails(input.scope),
        rawRetentionHours,
      };

      yield* await processAttemptRecorder.record(repositoryContext, {
        id: processAttemptId,
        kind: runtimeMonitoringCollectorWorkKind,
        status: "pending",
        operationKey: runtimeMonitoringCollectorOperationKey,
        dedupeKey: `runtime-monitoring-collect:${input.scope.kind}:${scopeId(input.scope)}:${scheduledAt}`,
        correlationId: context.requestId,
        requestId: context.requestId,
        phase: "runtime-monitoring-collector",
        step: "accepted",
        ...(input.scope.kind === "server" ? { serverId: input.scope.serverId } : {}),
        ...(input.scope.kind === "resource" ? { resourceId: input.scope.resourceId } : {}),
        ...(input.scope.kind === "deployment" ? { deploymentId: input.scope.deploymentId } : {}),
        startedAt: scheduledAt,
        updatedAt: scheduledAt,
        nextActions: ["no-action"],
        safeDetails,
      });

      const claimResult = yield* await processAttemptClaimer.claimDue(repositoryContext, {
        attemptId: processAttemptId,
        workerId: runtimeMonitoringCollectorWorkerId,
        claimedAt: scheduledAt,
        safeDetails,
      });

      if (claimResult.status !== "claimed") {
        return err(
          domainError.conflict("Runtime monitoring collection attempt could not be claimed", {
            phase: "runtime-monitoring-collector",
            processAttemptId,
            claimStatus: claimResult.status,
          }),
        );
      }

      const inspectionResult = await runtimeUsageInspectionQueryService.execute(
        context,
        new InspectRuntimeUsageQuery({
          scope: input.scope,
          mode: "current",
          includeArtifacts: true,
          includeWarnings: true,
        }),
      );
      const collectedAt = clock.now();

      if (inspectionResult.isErr()) {
        yield* await processAttemptCompleter.complete(repositoryContext, {
          attemptId: processAttemptId,
          status: "retry-scheduled",
          completedAt: collectedAt,
          phase: "runtime-monitoring-collector",
          step: "runtime-usage.inspect",
          errorCode: inspectionResult.error.code,
          errorCategory: inspectionResult.error.category,
          retriable: true,
          nextEligibleAt: collectedAt,
          nextActions: ["retry", "manual-review"],
          safeDetails,
        });
        return err(inspectionResult.error);
      }

      const observedAt = inspectionResult.value.observedAt ?? inspectionResult.value.generatedAt;
      const retainedUntilResult = retainedUntilFrom(observedAt, rawRetentionHours);
      if (retainedUntilResult.isErr()) {
        yield* await processAttemptCompleter.complete(repositoryContext, {
          attemptId: processAttemptId,
          status: "failed",
          completedAt: collectedAt,
          phase: "runtime-monitoring-collector",
          step: "retention-window",
          errorCode: retainedUntilResult.error.code,
          errorCategory: retainedUntilResult.error.category,
          retriable: false,
          nextActions: ["manual-review"],
          safeDetails,
        });
        return err(retainedUntilResult.error);
      }
      const retainedUntil = retainedUntilResult.value;
      const sample = sampleFromInspection({
        sampleId,
        scope: input.scope,
        inspection: inspectionResult.value,
        collectedAt,
        retainedUntil,
      });
      const recordedSample = await sampleWriteStore.record(repositoryContext, sample);

      if (recordedSample.isErr()) {
        yield* await processAttemptCompleter.complete(repositoryContext, {
          attemptId: processAttemptId,
          status: "retry-scheduled",
          completedAt: collectedAt,
          phase: "runtime-monitoring-collector",
          step: "sample-record",
          errorCode: recordedSample.error.code,
          errorCategory: recordedSample.error.category,
          retriable: true,
          nextEligibleAt: collectedAt,
          nextActions: ["retry", "manual-review"],
          safeDetails,
        });
        return err(recordedSample.error);
      }

      yield* await processAttemptCompleter.complete(repositoryContext, {
        attemptId: processAttemptId,
        status: "succeeded",
        completedAt: collectedAt,
        phase: "runtime-monitoring-collector",
        step: "sample-record",
        nextActions: ["no-action"],
        safeDetails: {
          ...safeDetails,
          sampleId,
          observedAt,
          retainedUntil,
          partial: sample.partial,
          warningCount: sample.warnings.length,
          sourceErrorCount: sample.sourceErrors.length,
        },
      });

      return ok({
        schemaVersion: "runtime-monitoring.collect/v1",
        processAttemptId,
        sampleId,
        scope: input.scope,
        observedAt,
        collectedAt,
        retainedUntil,
        partial: sample.partial,
        warningCount: sample.warnings.length,
        sourceErrorCount: sample.sourceErrors.length,
      } satisfies RuntimeMonitoringCollectorRunResult);
    });
  }
}
