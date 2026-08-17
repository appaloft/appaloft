import {
  err,
  ok,
  ResourceAutoDeployPathPolicy,
  type Result,
  SourcePathPattern,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { findOperationCatalogEntryByKey } from "../../operation-catalog";
import { checkOperationGuards } from "../../operation-guard";
import {
  AllowAllOperationGuardPort,
  type AutoDeploySourceEventKind,
  type Clock,
  type CompleteSourceEventCheckResult,
  type IdGenerator,
  type IngestSourceEventResult,
  type OperationGuardPort,
  type ProcessAttemptNextAction,
  type ProcessAttemptRecorder,
  type SourceEventChangedPathResolver,
  type SourceEventChangeSet,
  type SourceEventCheckObservation,
  type SourceEventDeploymentDispatcher,
  type SourceEventIdentity,
  type SourceEventIgnoredReason,
  type SourceEventPolicyCandidate,
  type SourceEventPolicyReader,
  type SourceEventPolicyResult,
  type SourceEventRecord,
  type SourceEventRecorder,
  type SourceEventVerificationSummary,
} from "../../ports";
import { NoopProcessAttemptRecorder } from "../../process-attempt-journal";
import { tokens } from "../../tokens";
import { parseOperationInput } from "../shared-schema";
import {
  type CompleteSourceEventCheckCommandInput,
  completeSourceEventCheckCommandInputSchema,
} from "./complete-source-event-check.schema";
import {
  type IngestSourceEventCommandInput,
  type IngestSourceEventCommandPayload,
  ingestSourceEventCommandInputSchema,
} from "./ingest-source-event.schema";

const ingestSourceEventOperation = findOperationCatalogEntryByKey("source-events.ingest");
const defaultOperationGuardPort = new AllowAllOperationGuardPort();

@injectable()
export class IngestSourceEventUseCase {
  constructor(
    @inject(tokens.sourceEventRecorder)
    private readonly sourceEventRecorder: SourceEventRecorder,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
    @inject(tokens.sourceEventPolicyReader)
    private readonly sourceEventPolicyReader?: SourceEventPolicyReader,
    @inject(tokens.sourceEventDeploymentDispatcher)
    private readonly sourceEventDeploymentDispatcher?: SourceEventDeploymentDispatcher,
    @inject(tokens.processAttemptRecorder)
    private readonly processAttemptRecorder: ProcessAttemptRecorder = new NoopProcessAttemptRecorder(),
    @inject(tokens.operationGuardPort)
    private readonly operationGuardPort?: OperationGuardPort,
    @inject(tokens.sourceEventChangedPathResolver)
    private readonly sourceEventChangedPathResolver?: SourceEventChangedPathResolver,
  ) {}

  async execute(
    context: ExecutionContext,
    input: IngestSourceEventCommandInput,
  ): Promise<Result<IngestSourceEventResult>> {
    const parsed = parseOperationInput(ingestSourceEventCommandInputSchema, input);
    if (parsed.isErr()) {
      return err(parsed.error);
    }

    return this.executeParsed(context, parsed.value);
  }

  async completeCheck(
    context: ExecutionContext,
    input: CompleteSourceEventCheckCommandInput,
  ): Promise<Result<CompleteSourceEventCheckResult>> {
    const parsed = parseOperationInput(completeSourceEventCheckCommandInputSchema, input);
    if (parsed.isErr()) {
      return err(parsed.error);
    }

    const repositoryContext = toRepositoryContext(context);
    const sourceIdentity = sourceIdentityFromInput(parsed.value.sourceIdentity);
    const applied = await this.sourceEventRecorder.applyCompletedCheck(
      repositoryContext,
      {
        sourceKind: "github",
        sourceIdentity,
        revision: parsed.value.revision,
        deliveryId: parsed.value.deliveryId,
        observation: { ...parsed.value.check },
        receivedAt: parsed.value.receivedAt ?? this.clock.now(),
      },
      (record) =>
        evolveCompletedSourceCheck(record, parsed.value.check, {
          allowDispatchClaim: Boolean(
            this.sourceEventPolicyReader && this.sourceEventDeploymentDispatcher,
          ),
        }),
    );

    if (applied.duplicate) {
      return ok({
        deliveryId: parsed.value.deliveryId,
        status: "deduped",
        sourceEventIds: [],
        dispatchedResourceIds: [],
        createdDeploymentIds: [],
      });
    }

    const createdDeploymentIds: string[] = [];
    const dispatchedResourceIds: string[] = [];
    if (this.sourceEventPolicyReader && this.sourceEventDeploymentDispatcher) {
      const candidates = await this.sourceEventPolicyReader.listCandidates(repositoryContext, {
        sourceKind: "github",
        sourceIdentity,
      });
      for (const transition of applied.transitions) {
        const targets = transition.claimedResourceIds
          .map((resourceId) => candidates.find((candidate) => candidate.resourceId === resourceId))
          .filter((candidate): candidate is SourceEventPolicyCandidate =>
            Boolean(
              candidate &&
                candidate.status === "enabled" &&
                candidate.refs.includes(transition.record.ref) &&
                candidate.eventKinds.includes(
                  transition.record.eventKind as AutoDeploySourceEventKind,
                ),
            ),
          );
        let finalized = transition.record;
        if (targets.length > 0) {
          finalized = await dispatchSourceEventDeployments(
            context,
            this.sourceEventRecorder,
            this.sourceEventDeploymentDispatcher,
            repositoryContext,
            finalized,
            targets,
          );
          dispatchedResourceIds.push(...targets.map((target) => target.resourceId));
        }
        const targetIds = new Set(targets.map((target) => target.resourceId));
        const unavailableResourceIds = transition.claimedResourceIds.filter(
          (resourceId) => !targetIds.has(resourceId),
        );
        if (unavailableResourceIds.length > 0) {
          const unavailable = new Set(unavailableResourceIds);
          finalized = await this.sourceEventRecorder.updateOutcome(repositoryContext, {
            sourceEventId: finalized.sourceEventId,
            status: "failed",
            ...(finalized.projectId ? { projectId: finalized.projectId } : {}),
            matchedResourceIds: [...finalized.matchedResourceIds],
            ignoredReasons: [...finalized.ignoredReasons],
            policyResults: finalized.policyResults.map((result) =>
              unavailable.has(result.resourceId)
                ? {
                    ...result,
                    status: "dispatch-failed",
                    reason: "dispatch-failed",
                    errorCode: "source_event_policy_no_longer_dispatchable",
                  }
                : result,
            ),
            createdDeploymentIds: [...finalized.createdDeploymentIds],
          });
        }
        createdDeploymentIds.push(...finalized.createdDeploymentIds);
      }
    }

    return ok({
      deliveryId: parsed.value.deliveryId,
      status: "accepted",
      sourceEventIds: applied.transitions.map((transition) => transition.record.sourceEventId),
      dispatchedResourceIds: [...new Set(dispatchedResourceIds)],
      createdDeploymentIds: [...new Set(createdDeploymentIds)],
    });
  }

  private async executeParsed(
    context: ExecutionContext,
    input: IngestSourceEventCommandPayload,
  ): Promise<Result<IngestSourceEventResult>> {
    const repositoryContext = toRepositoryContext(context);
    const dedupeKey = sourceEventDedupeKey(input);
    if (ingestSourceEventOperation) {
      const checked = await checkOperationGuards({
        context,
        entry: ingestSourceEventOperation,
        message: input,
        operationGuardPort: this.operationGuardPort ?? defaultOperationGuardPort,
        ...(input.scopeResourceId ? { resourceRefs: { resourceId: input.scopeResourceId } } : {}),
        contextAttributes: {
          sourceKind: input.sourceKind,
          eventKind: input.eventKind,
          estimatedExternalProviderCalls: 1,
        },
      });
      if (checked.isErr()) {
        return err(checked.error);
      }
    }

    const existing = await this.sourceEventRecorder.findByDedupeKey(repositoryContext, dedupeKey);
    const sourceIdentity = sourceIdentityFromInput(input.sourceIdentity);

    if (existing) {
      return ok({
        sourceEventId: existing.sourceEventId,
        status: "deduped",
        matchedResourceIds: [...existing.matchedResourceIds],
        createdDeploymentIds: [...existing.createdDeploymentIds],
        ignoredReasons: [...existing.ignoredReasons],
        dedupeOfSourceEventId: existing.sourceEventId,
      });
    }

    const sourceEventId = this.idGenerator.next("sevt");
    const outcome =
      this.sourceEventPolicyReader && isDeploymentSourceEventKind(input.eventKind)
        ? await evaluateSourceEventPolicyMatch(
            repositoryContext,
            this.sourceEventPolicyReader,
            input.sourceKind,
            sourceIdentity,
            input.eventKind,
            input.ref,
            input.scopeResourceId,
            {
              executionContext: context,
              ...(this.sourceEventChangedPathResolver
                ? { changedPathResolver: this.sourceEventChangedPathResolver }
                : {}),
              revision: input.revision,
              ...(input.beforeRevision ? { beforeRevision: input.beforeRevision } : {}),
              refChangeKind: input.refChangeKind ?? "updated",
              forced: input.forced ?? false,
              ...(input.providerConnectionId
                ? { providerConnectionId: input.providerConnectionId }
                : {}),
            },
          )
        : emptySourceEventOutcome();

    const record: SourceEventRecord = {
      sourceEventId,
      ...(outcome.projectId ? { projectId: outcome.projectId } : {}),
      sourceKind: input.sourceKind,
      eventKind: input.eventKind,
      sourceIdentity,
      ref: input.ref,
      revision: input.revision,
      changeSet: outcome.changeSet,
      ...(input.deliveryId ? { deliveryId: input.deliveryId } : {}),
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      dedupeKey,
      dedupeStatus: "new",
      verification: verificationFromInput(input.verification),
      status: outcome.status,
      matchedResourceIds: outcome.matchedResourceIds,
      ignoredReasons: outcome.ignoredReasons,
      policyResults: outcome.policyResults,
      createdDeploymentIds: outcome.createdDeploymentIds,
      receivedAt: input.receivedAt ?? this.clock.now(),
    };

    const stored = await this.sourceEventRecorder.record(repositoryContext, record);
    if (stored.sourceEventId === sourceEventId && stored.matchedResourceIds.length > 0) {
      await this.sourceEventRecorder.supersedeOlderPending(repositoryContext, {
        sourceEventId: stored.sourceEventId,
        sourceKind: stored.sourceKind,
        sourceIdentity: stored.sourceIdentity,
        ref: stored.ref,
        receivedAt: stored.receivedAt,
        matchedResourceIds: [...stored.matchedResourceIds],
      });
    }
    await recordSourceEventProcessAttempt({
      recorder: this.processAttemptRecorder,
      repositoryContext,
      context,
      record: stored,
      phase: "source-event-ingest",
      step: stored.status,
      dispatchTargetCount: outcome.dispatchTargets.length,
    });
    if (
      this.sourceEventDeploymentDispatcher &&
      stored.sourceEventId === sourceEventId &&
      outcome.dispatchTargets.length > 0
    ) {
      const dispatched = await dispatchSourceEventDeployments(
        context,
        this.sourceEventRecorder,
        this.sourceEventDeploymentDispatcher,
        repositoryContext,
        stored,
        outcome.dispatchTargets,
      );
      await recordSourceEventProcessAttempt({
        recorder: this.processAttemptRecorder,
        repositoryContext,
        context,
        record: dispatched,
        phase: "source-event-dispatch",
        step: dispatched.status,
        dispatchTargetCount: outcome.dispatchTargets.length,
      });
      return ok(resultFromRecord(dispatched));
    }

    return ok(resultFromRecord(stored));
  }
}

function isDeploymentSourceEventKind(
  eventKind: IngestSourceEventCommandPayload["eventKind"],
): eventKind is AutoDeploySourceEventKind {
  return eventKind === "push" || eventKind === "tag";
}

function sourceEventProcessStatus(record: SourceEventRecord): "running" | "succeeded" | "failed" {
  switch (record.status) {
    case "accepted":
    case "waiting-checks":
      return record.matchedResourceIds.length > 0 ? "running" : "succeeded";
    case "dispatched":
    case "ignored":
    case "superseded":
      return "succeeded";
    case "blocked":
    case "checks-blocked":
    case "failed":
      return "failed";
    case "deduped":
      return "succeeded";
  }
}

function sourceEventProcessNextActions(record: SourceEventRecord): ProcessAttemptNextAction[] {
  return record.status === "blocked" ||
    record.status === "checks-blocked" ||
    record.status === "failed"
    ? ["diagnostic", "manual-review"]
    : ["no-action"];
}

function singleValue(values: string[]): string | undefined {
  return values.length === 1 ? values[0] : undefined;
}

function firstDispatchErrorCode(record: SourceEventRecord): string | undefined {
  return record.policyResults.find((result) => result.status === "dispatch-failed")?.errorCode;
}

async function recordSourceEventProcessAttempt(input: {
  recorder: ProcessAttemptRecorder;
  repositoryContext: ReturnType<typeof toRepositoryContext>;
  context: ExecutionContext;
  record: SourceEventRecord;
  phase: "source-event-ingest" | "source-event-dispatch";
  step: string;
  dispatchTargetCount: number;
}): Promise<void> {
  const processStatus = sourceEventProcessStatus(input.record);
  const resourceId = singleValue(input.record.matchedResourceIds);
  const deploymentId = singleValue(input.record.createdDeploymentIds);
  const errorCode =
    firstDispatchErrorCode(input.record) ??
    (input.record.status === "blocked" ? "source_event_policy_blocked" : undefined);
  const nextActions = sourceEventProcessNextActions(input.record);
  const result = await input.recorder.record(input.repositoryContext, {
    id: input.record.sourceEventId,
    kind: "system",
    status: processStatus,
    operationKey: "source-events.ingest",
    dedupeKey: `source-event:${input.record.dedupeKey}`,
    correlationId: input.context.requestId,
    requestId: input.context.requestId,
    phase: input.phase,
    step: input.step,
    ...(input.record.projectId ? { projectId: input.record.projectId } : {}),
    ...(resourceId ? { resourceId } : {}),
    ...(deploymentId ? { deploymentId } : {}),
    startedAt: input.record.receivedAt,
    updatedAt: input.record.receivedAt,
    ...(processStatus !== "running" ? { finishedAt: input.record.receivedAt } : {}),
    ...(errorCode ? { errorCode, errorCategory: "async-processing" } : {}),
    ...(processStatus === "failed" ? { retriable: input.record.status === "failed" } : {}),
    nextActions,
    safeDetails: {
      sourceKind: input.record.sourceKind,
      eventKind: input.record.eventKind,
      ref: input.record.ref,
      verificationStatus: input.record.verification.status,
      ...(input.record.sourceIdentity.repositoryFullName
        ? { repositoryFullName: input.record.sourceIdentity.repositoryFullName }
        : {}),
      matchedResourceCount: input.record.matchedResourceIds.length,
      ignoredReasonCount: input.record.ignoredReasons.length,
      policyResultCount: input.record.policyResults.length,
      createdDeploymentCount: input.record.createdDeploymentIds.length,
      dispatchTargetCount: input.dispatchTargetCount,
      sourceEventStatus: input.record.status,
      ...(input.record.changeSet
        ? {
            refChangeKind: input.record.changeSet.refChangeKind,
            finalDiffStatus: input.record.changeSet.status,
            ...(input.record.changeSet.changedPathCount !== undefined
              ? { changedPathCount: input.record.changeSet.changedPathCount }
              : {}),
          }
        : {}),
    },
  });

  void result;
}

export interface SourceEventOutcome {
  status: "accepted" | "ignored" | "blocked" | "waiting-checks";
  projectId?: string;
  matchedResourceIds: string[];
  ignoredReasons: SourceEventIgnoredReason[];
  policyResults: SourceEventPolicyResult[];
  createdDeploymentIds: string[];
  dispatchTargets: SourceEventPolicyCandidate[];
  changeSet: SourceEventChangeSet;
}

function emptySourceEventOutcome(): SourceEventOutcome {
  return {
    status: "accepted",
    matchedResourceIds: [],
    ignoredReasons: [],
    policyResults: [],
    createdDeploymentIds: [],
    dispatchTargets: [],
    changeSet: { status: "not-requested", refChangeKind: "updated" },
  };
}

export async function evaluateSourceEventPolicyMatch(
  context: Parameters<SourceEventPolicyReader["listCandidates"]>[0],
  sourceEventPolicyReader: SourceEventPolicyReader,
  sourceKind: IngestSourceEventCommandPayload["sourceKind"],
  sourceIdentity: SourceEventIdentity,
  eventKind: AutoDeploySourceEventKind,
  ref: string,
  scopeResourceId: string | undefined,
  changeInput: {
    executionContext: ExecutionContext;
    changedPathResolver?: SourceEventChangedPathResolver;
    revision: string;
    beforeRevision?: string;
    refChangeKind: "created" | "updated" | "deleted";
    forced: boolean;
    providerConnectionId?: string;
    existingChangeSet?: SourceEventChangeSet;
  },
): Promise<SourceEventOutcome> {
  const allCandidates = await sourceEventPolicyReader.listCandidates(context, {
    sourceKind,
    sourceIdentity,
  });
  const candidates = scopeResourceId
    ? allCandidates.filter((candidate) => candidate.resourceId === scopeResourceId)
    : allCandidates;
  const finalDiffCandidates = candidates.filter(
    (candidate) =>
      candidate.status === "enabled" &&
      candidate.eventKinds.includes(eventKind) &&
      candidate.refs.includes(ref),
  );

  const changeSet = await resolveChangeSet({
    sourceKind,
    sourceIdentity,
    ref,
    candidates: finalDiffCandidates,
    ...changeInput,
  });

  if (candidates.length === 0) {
    return {
      status: "ignored",
      matchedResourceIds: [],
      ignoredReasons: ["no-matching-policy"],
      policyResults: [],
      createdDeploymentIds: [],
      dispatchTargets: [],
      changeSet,
    };
  }

  const policyResults: SourceEventPolicyResult[] = [];
  const ignoredReasons = new Set<SourceEventIgnoredReason>();
  const matchedResourceIds: string[] = [];
  const dispatchTargets: SourceEventPolicyCandidate[] = [];
  let projectId: string | undefined;

  for (const candidate of candidates) {
    projectId ??= candidate.projectId;

    if (changeInput.refChangeKind === "deleted") {
      ignoredReasons.add("ref-deleted");
      policyResults.push({
        resourceId: candidate.resourceId,
        status: "ignored",
        reason: "ref-deleted",
      });
      continue;
    }

    if (candidate.status === "blocked") {
      ignoredReasons.add("policy-blocked");
      policyResults.push({
        resourceId: candidate.resourceId,
        status: "blocked",
        reason: "policy-blocked",
      });
      continue;
    }

    if (candidate.status === "disabled") {
      ignoredReasons.add("policy-disabled");
      policyResults.push({
        resourceId: candidate.resourceId,
        status: "ignored",
        reason: "policy-disabled",
      });
      continue;
    }

    if (!candidate.eventKinds.includes(eventKind) || !candidate.refs.includes(ref)) {
      ignoredReasons.add("ref-not-matched");
      policyResults.push({
        resourceId: candidate.resourceId,
        status: "ignored",
        reason: "ref-not-matched",
      });
      continue;
    }

    if ((candidate.includePaths?.length ?? 0) > 0 || (candidate.excludePaths?.length ?? 0) > 0) {
      if (changeSet.status !== "resolved") {
        ignoredReasons.add("path-diff-unavailable");
        policyResults.push({
          resourceId: candidate.resourceId,
          status: "ignored",
          reason: "path-diff-unavailable",
        });
        continue;
      }

      const pathPolicy = ResourceAutoDeployPathPolicy.rehydrate({
        includePaths: (candidate.includePaths ?? []).map((pattern) =>
          SourcePathPattern.rehydrate(pattern),
        ),
        excludePaths: (candidate.excludePaths ?? []).map((pattern) =>
          SourcePathPattern.rehydrate(pattern),
        ),
      });
      const matchingPaths = pathPolicy.matchingPaths(changeSet.changedPaths ?? []);
      if (matchingPaths.length === 0) {
        ignoredReasons.add("path-not-matched");
        policyResults.push({
          resourceId: candidate.resourceId,
          status: "ignored",
          reason: "path-not-matched",
        });
        continue;
      }

      matchedResourceIds.push(candidate.resourceId);
      addMatchedPolicyResult({
        candidate,
        dispatchTargets,
        policyResults,
        matchedPathCount: matchingPaths.length,
        matchedPaths: matchingPaths.slice(0, 20),
      });
      continue;
    }

    matchedResourceIds.push(candidate.resourceId);
    addMatchedPolicyResult({ candidate, dispatchTargets, policyResults });
  }

  if (matchedResourceIds.length > 0) {
    return {
      status: policyResults.some((result) => result.status === "waiting-checks")
        ? "waiting-checks"
        : "accepted",
      ...(projectId ? { projectId } : {}),
      matchedResourceIds,
      ignoredReasons: [...ignoredReasons],
      policyResults,
      createdDeploymentIds: [],
      dispatchTargets,
      changeSet,
    };
  }

  return {
    status: ignoredReasons.has("policy-blocked") ? "blocked" : "ignored",
    ...(projectId ? { projectId } : {}),
    matchedResourceIds: [],
    ignoredReasons: [...ignoredReasons],
    policyResults,
    createdDeploymentIds: [],
    dispatchTargets: [],
    changeSet,
  };
}

function addMatchedPolicyResult(input: {
  candidate: SourceEventPolicyCandidate;
  dispatchTargets: SourceEventPolicyCandidate[];
  policyResults: SourceEventPolicyResult[];
  matchedPathCount?: number;
  matchedPaths?: string[];
}): void {
  const common = {
    resourceId: input.candidate.resourceId,
    ...(input.matchedPathCount !== undefined ? { matchedPathCount: input.matchedPathCount } : {}),
    ...(input.matchedPaths ? { matchedPaths: input.matchedPaths } : {}),
  };
  if ((input.candidate.requiredChecks?.length ?? 0) > 0) {
    input.policyResults.push({
      ...common,
      status: "waiting-checks",
      reason: "required-checks-pending",
      requiredChecks: [...(input.candidate.requiredChecks ?? [])],
      observedChecks: [],
    });
    return;
  }

  input.dispatchTargets.push(input.candidate);
  input.policyResults.push({ ...common, status: "matched" });
}

export function evolveCompletedSourceCheck(
  record: SourceEventRecord,
  observation: SourceEventCheckObservation,
  options: { allowDispatchClaim: boolean },
): { record: SourceEventRecord; claimedResourceIds: string[] } {
  const claimedResourceIds: string[] = [];
  const policyResults = record.policyResults.map((result) => {
    if (
      (result.status !== "waiting-checks" && result.status !== "checks-blocked") ||
      !result.requiredChecks?.includes(observation.name)
    ) {
      return result;
    }

    const observedByName = new Map(
      (result.observedChecks ?? []).map((check) => [check.name, { ...check }]),
    );
    const existing = observedByName.get(observation.name);
    if (!existing || compareCheckObservations(existing, observation) <= 0) {
      observedByName.set(observation.name, { ...observation });
    }
    const observedChecks = [...observedByName.values()];
    const requiredObservations = result.requiredChecks.map((name) => observedByName.get(name));
    const hasFailure = requiredObservations.some(
      (check) => check && !isPassingCheckConclusion(check.conclusion),
    );
    if (hasFailure) {
      return {
        ...result,
        status: "checks-blocked" as const,
        reason: "required-checks-failed" as const,
        observedChecks,
      };
    }
    const allPassing = requiredObservations.every(
      (check) => check && isPassingCheckConclusion(check.conclusion),
    );
    if (allPassing && options.allowDispatchClaim) {
      claimedResourceIds.push(result.resourceId);
      const { reason: _reason, ...resultWithoutReason } = result;
      return {
        ...resultWithoutReason,
        status: "dispatching" as const,
        observedChecks,
      };
    }
    return {
      ...result,
      status: "waiting-checks" as const,
      reason: "required-checks-pending" as const,
      observedChecks,
    };
  });

  return {
    record: {
      ...record,
      status: sourceEventStatusFromPolicyResults(policyResults),
      policyResults,
    },
    claimedResourceIds,
  };
}

function compareCheckObservations(
  left: SourceEventCheckObservation,
  right: SourceEventCheckObservation,
): number {
  const completedAt = left.completedAt.localeCompare(right.completedAt);
  return completedAt !== 0 ? completedAt : left.checkRunId.localeCompare(right.checkRunId);
}

function isPassingCheckConclusion(conclusion: SourceEventCheckObservation["conclusion"]): boolean {
  return conclusion === "success" || conclusion === "neutral" || conclusion === "skipped";
}

function sourceEventStatusFromPolicyResults(
  policyResults: SourceEventPolicyResult[],
): SourceEventRecord["status"] {
  if (policyResults.some((result) => result.status === "dispatch-failed")) return "failed";
  if (policyResults.some((result) => result.status === "checks-blocked")) return "checks-blocked";
  if (
    policyResults.some(
      (result) => result.status === "waiting-checks" || result.status === "dispatching",
    )
  ) {
    return "waiting-checks";
  }
  if (policyResults.some((result) => result.status === "dispatched")) return "dispatched";
  if (policyResults.every((result) => result.status === "superseded")) return "superseded";
  return "accepted";
}

async function resolveChangeSet(input: {
  executionContext: ExecutionContext;
  changedPathResolver?: SourceEventChangedPathResolver;
  sourceKind: IngestSourceEventCommandPayload["sourceKind"];
  sourceIdentity: SourceEventIdentity;
  ref: string;
  revision: string;
  beforeRevision?: string;
  refChangeKind: "created" | "updated" | "deleted";
  forced: boolean;
  providerConnectionId?: string;
  candidates: SourceEventPolicyCandidate[];
  existingChangeSet?: SourceEventChangeSet;
}): Promise<SourceEventChangeSet> {
  if (input.existingChangeSet) {
    return input.existingChangeSet;
  }

  const base = {
    refChangeKind: input.refChangeKind,
    ...(input.beforeRevision ? { beforeRevision: input.beforeRevision } : {}),
    forced: input.forced,
  };
  if (input.refChangeKind === "deleted") {
    return { status: "not-requested", ...base };
  }

  const requiresPaths = input.candidates.some(
    (candidate) =>
      (candidate.includePaths?.length ?? 0) > 0 || (candidate.excludePaths?.length ?? 0) > 0,
  );
  if (!requiresPaths) {
    return { status: "not-requested", ...base };
  }

  if (!input.changedPathResolver) {
    return {
      status: "unavailable",
      ...base,
      unavailableReason: "provider-compare-unavailable",
    };
  }

  const resolved = await input.changedPathResolver.resolve(input.executionContext, {
    sourceKind: input.sourceKind,
    sourceIdentity: input.sourceIdentity,
    ref: input.ref,
    revision: input.revision,
    ...(input.beforeRevision ? { beforeRevision: input.beforeRevision } : {}),
    refChangeKind: input.refChangeKind,
    forced: input.forced,
    ...(input.providerConnectionId ? { providerConnectionId: input.providerConnectionId } : {}),
  });
  if (resolved.isErr()) {
    return {
      status: "unavailable",
      ...base,
      unavailableReason: "provider-compare-unavailable",
    };
  }
  if (resolved.value.status === "unavailable") {
    return {
      status: "unavailable",
      ...base,
      unavailableReason: resolved.value.reason,
    };
  }

  const changedPaths = [...new Set(resolved.value.changedPaths)];
  if (changedPaths.length > 300) {
    return {
      status: "unavailable",
      ...base,
      unavailableReason: "provider-compare-truncated",
    };
  }

  return {
    status: "resolved",
    ...base,
    changedPaths,
    changedPathCount: changedPaths.length,
  };
}

export async function dispatchSourceEventDeployments(
  context: ExecutionContext,
  sourceEventRecorder: SourceEventRecorder,
  sourceEventDeploymentDispatcher: SourceEventDeploymentDispatcher,
  repositoryContext: Parameters<SourceEventRecorder["updateOutcome"]>[0],
  record: SourceEventRecord,
  targets: SourceEventPolicyCandidate[],
): Promise<SourceEventRecord> {
  const dispatchResults = new Map<string, SourceEventPolicyResult>();
  const createdDeploymentIds: string[] = [...record.createdDeploymentIds];
  const priorPolicyResults = new Map(
    record.policyResults.map((result) => [result.resourceId, result]),
  );

  for (const target of targets) {
    if (!target.serverId) {
      dispatchResults.set(target.resourceId, {
        ...priorPolicyResults.get(target.resourceId),
        resourceId: target.resourceId,
        status: "dispatch-failed",
        reason: "dispatch-failed",
        errorCode: "source_event_dispatch_failed",
      });
      continue;
    }

    const result = await sourceEventDeploymentDispatcher.dispatch(context, {
      sourceEventId: record.sourceEventId,
      projectId: target.projectId,
      environmentId: target.environmentId,
      resourceId: target.resourceId,
      serverId: target.serverId,
      ...(target.destinationId ? { destinationId: target.destinationId } : {}),
    });
    if (result.isErr()) {
      dispatchResults.set(target.resourceId, {
        ...priorPolicyResults.get(target.resourceId),
        resourceId: target.resourceId,
        status: "dispatch-failed",
        reason: "dispatch-failed",
        errorCode: result.error.code,
      });
      continue;
    }

    createdDeploymentIds.push(result.value.deploymentId);
    dispatchResults.set(target.resourceId, {
      ...priorPolicyResults.get(target.resourceId),
      resourceId: target.resourceId,
      status: "dispatched",
      deploymentId: result.value.deploymentId,
    });
  }

  const policyResults = record.policyResults.map(
    (policyResult) => dispatchResults.get(policyResult.resourceId) ?? policyResult,
  );
  const hasDispatchFailure = policyResults.some((result) => result.status === "dispatch-failed");

  return sourceEventRecorder.updateOutcome(repositoryContext, {
    sourceEventId: record.sourceEventId,
    status: hasDispatchFailure ? "failed" : sourceEventStatusFromPolicyResults(policyResults),
    ...(record.projectId ? { projectId: record.projectId } : {}),
    matchedResourceIds: [...record.matchedResourceIds],
    ignoredReasons: [...record.ignoredReasons],
    policyResults,
    createdDeploymentIds,
  });
}

export function sourceEventDedupeKey(input: {
  sourceKind: IngestSourceEventCommandPayload["sourceKind"];
  eventKind: IngestSourceEventCommandPayload["eventKind"];
  scopeResourceId?: string | undefined;
  sourceIdentity: IngestSourceEventCommandPayload["sourceIdentity"];
  ref: string;
  revision: string;
  deliveryId?: string | undefined;
  idempotencyKey?: string | undefined;
}): string {
  const identity = [
    input.sourceKind,
    input.sourceIdentity.providerRepositoryId ?? "",
    input.sourceIdentity.repositoryFullName ?? "",
    safeSourceLocator(input.sourceIdentity.locator),
  ].join(":");
  const scope = input.scopeResourceId ? `resource:${input.scopeResourceId.trim()}:` : "";

  if (input.deliveryId) {
    return `delivery:${scope}${identity}:${input.deliveryId.trim()}`;
  }

  if (input.idempotencyKey) {
    return `idempotency:${scope}${identity}:${input.idempotencyKey.trim()}`;
  }

  return `event:${scope}${identity}:${input.eventKind}:${input.ref.trim()}:${input.revision.trim()}`;
}

function sourceIdentityFromInput(
  input: IngestSourceEventCommandPayload["sourceIdentity"],
): SourceEventIdentity {
  return {
    locator: safeSourceLocator(input.locator),
    ...(input.providerRepositoryId ? { providerRepositoryId: input.providerRepositoryId } : {}),
    ...(input.repositoryFullName ? { repositoryFullName: input.repositoryFullName } : {}),
  };
}

function verificationFromInput(
  input: IngestSourceEventCommandPayload["verification"],
): SourceEventVerificationSummary {
  return {
    status: input.status,
    method: input.method,
    ...(input.keyVersion ? { keyVersion: input.keyVersion } : {}),
  };
}

function safeSourceLocator(locator: string): string {
  try {
    const parsed = new URL(locator);
    parsed.username = "";
    parsed.password = "";
    return parsed.toString();
  } catch {
    return locator.trim();
  }
}

function resultFromRecord(record: SourceEventRecord): IngestSourceEventResult {
  return {
    sourceEventId: record.sourceEventId,
    status: record.status,
    matchedResourceIds: [...record.matchedResourceIds],
    createdDeploymentIds: [...record.createdDeploymentIds],
    ignoredReasons: [...record.ignoredReasons],
    ...(record.dedupeOfSourceEventId
      ? { dedupeOfSourceEventId: record.dedupeOfSourceEventId }
      : {}),
  };
}
