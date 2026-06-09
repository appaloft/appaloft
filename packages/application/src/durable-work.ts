import { domainError, err, ok, type Result } from "@appaloft/core";
import {
  type ExecutionContext,
  type RepositoryContext,
  toRepositoryContext,
} from "./execution-context";

export type DurableWorkRuntimeMode = "embedded" | "standalone" | "disabled";
export type DurableWorkQueueBackend = "database" | "external";
export type DurableWorkExternalBackendKind = "kafka" | "temporal" | "custom";
export type DurableWorkItemStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled"
  | "retry-scheduled"
  | "dead-lettered";
export type DurableWorkEventKind =
  | "accepted"
  | "claimed"
  | "progress"
  | "retry-scheduled"
  | "completed"
  | "failed"
  | "canceled"
  | "dead-lettered";

type DurableWorkSafeValue = string | number | boolean | null;

export interface DurableWorkRuntimeConfig {
  readonly mode: DurableWorkRuntimeMode;
  readonly queueBackend: DurableWorkQueueBackend;
  readonly workerCount: number;
  readonly workerGroup: string;
  readonly externalBackendKind?: DurableWorkExternalBackendKind;
}

export interface DurableWorkWorkerIdentity {
  readonly workerId: string;
  readonly workerGroup: string;
  readonly slot: number;
}

export type DurableWorkWorkerHeartbeatStatus = "online" | "stopping";

export interface DurableWorkWorkerHeartbeatRecord {
  readonly workerId: string;
  readonly workerGroup: string;
  readonly slot: number;
  readonly mode: DurableWorkRuntimeMode;
  readonly queueBackend: DurableWorkQueueBackend;
  readonly processStartedAt: string;
  readonly lastSeenAt: string;
  readonly status: DurableWorkWorkerHeartbeatStatus;
}

export interface DurableWorkWorkerHeartbeatFilter {
  readonly workerGroup?: string;
  readonly limit?: number;
}

export interface DurableWorkWorkerHeartbeatStore {
  recordHeartbeat(
    context: RepositoryContext,
    heartbeat: DurableWorkWorkerHeartbeatRecord,
  ): Promise<Result<DurableWorkWorkerHeartbeatRecord>>;
  markStopped(
    context: RepositoryContext,
    input: Pick<DurableWorkWorkerHeartbeatRecord, "workerId" | "lastSeenAt">,
  ): Promise<Result<void>>;
  listHeartbeats(
    context: RepositoryContext,
    filter?: DurableWorkWorkerHeartbeatFilter,
  ): Promise<Result<DurableWorkWorkerHeartbeatRecord[]>>;
}

export interface DurableWorkTopology {
  readonly mode: DurableWorkRuntimeMode;
  readonly queueBackend: DurableWorkQueueBackend;
  readonly workerGroup: string;
  readonly expectedWorkerCount: number;
  readonly workers: readonly DurableWorkWorkerIdentity[];
  readonly coordinationRole: "coordinator" | "worker" | "disabled";
}

export interface DurableWorkQueueAdapter
  extends DurableWorkLedger,
    DurableWorkDeliveryCandidateReader,
    DurableWorkClaimer,
    DurableWorkCompleter {}

export interface DurableWorkQueueBackendDescriptor {
  readonly backend: DurableWorkQueueBackend;
  readonly externalBackendKind?: DurableWorkExternalBackendKind;
  readonly durableStateAuthority:
    | "durable-work-ledger"
    | "external-workflow-engine-with-process-attempt-projection";
  readonly supportsMultipleWorkers: boolean;
  readonly supportsAtomicClaim: boolean;
}

export interface DurableWorkItemRecord {
  readonly id: string;
  readonly kind: string;
  readonly status: DurableWorkItemStatus;
  readonly operationKey: string;
  readonly queueBackend: DurableWorkQueueBackend;
  readonly dedupeKey?: string;
  readonly correlationId?: string;
  readonly requestId?: string;
  readonly projectId?: string;
  readonly environmentId?: string;
  readonly resourceId?: string;
  readonly deploymentId?: string;
  readonly serverId?: string;
  readonly subjectKind?: string;
  readonly subjectId?: string;
  readonly phase?: string;
  readonly step?: string;
  readonly priority: number;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly availableAt: string;
  readonly leaseOwner?: string;
  readonly leaseExpiresAt?: string;
  readonly startedAt?: string;
  readonly updatedAt: string;
  readonly finishedAt?: string;
  readonly errorCode?: string;
  readonly errorCategory?: string;
  readonly retriable?: boolean;
  readonly safeInput?: Record<string, DurableWorkSafeValue>;
  readonly safeDetails?: Record<string, DurableWorkSafeValue>;
}

export interface DurableWorkEventRecord {
  readonly id: string;
  readonly workItemId: string;
  readonly sequence: number;
  readonly kind: DurableWorkEventKind;
  readonly status?: DurableWorkItemStatus;
  readonly phase?: string;
  readonly step?: string;
  readonly message?: string;
  readonly workerId?: string;
  readonly workerGroup?: string;
  readonly occurredAt: string;
  readonly safeDetails?: Record<string, DurableWorkSafeValue>;
}

export interface DurableWorkListFilter {
  readonly kind?: string;
  readonly status?: DurableWorkItemStatus;
  readonly operationKey?: string;
  readonly projectId?: string;
  readonly resourceId?: string;
  readonly deploymentId?: string;
  readonly serverId?: string;
  readonly subjectKind?: string;
  readonly subjectId?: string;
  readonly limit?: number;
}

export interface DurableWorkDeliveryCandidateFilter {
  readonly now: string;
  readonly kind?: string;
  readonly operationKey?: string;
  readonly limit?: number;
}

export interface DurableWorkClaimInput {
  readonly workItemId: string;
  readonly workerId: string;
  readonly workerGroup?: string;
  readonly claimedAt: string;
  readonly leaseExpiresAt: string;
  readonly safeDetails?: Record<string, DurableWorkSafeValue>;
}

export type DurableWorkClaimResult =
  | {
      readonly status: "claimed";
      readonly workItem: DurableWorkItemRecord;
    }
  | {
      readonly status: "not-found";
      readonly workItemId: string;
    }
  | {
      readonly status: "refused";
      readonly reason: "not-due" | "not-claimable" | "lease-held";
      readonly workItem: DurableWorkItemRecord;
    };

export interface DurableWorkCompletionInput {
  readonly workItemId: string;
  readonly status: Extract<
    DurableWorkItemStatus,
    "succeeded" | "failed" | "canceled" | "retry-scheduled" | "dead-lettered"
  >;
  readonly completedAt: string;
  readonly phase?: string;
  readonly step?: string;
  readonly errorCode?: string;
  readonly errorCategory?: string;
  readonly retriable?: boolean;
  readonly nextAvailableAt?: string;
  readonly safeDetails?: Record<string, DurableWorkSafeValue>;
}

export type DurableWorkCompletionResult =
  | {
      readonly status: "completed";
      readonly workItem: DurableWorkItemRecord;
    }
  | {
      readonly status: "not-found";
      readonly workItemId: string;
    }
  | {
      readonly status: "not-running";
      readonly workItem: DurableWorkItemRecord;
    };

export interface DurableWorkLedger {
  recordItem(
    context: RepositoryContext,
    item: DurableWorkItemRecord,
  ): Promise<Result<DurableWorkItemRecord>>;
  appendEvent(
    context: RepositoryContext,
    event: DurableWorkEventRecord,
  ): Promise<Result<DurableWorkEventRecord>>;
  findItem(context: RepositoryContext, id: string): Promise<Result<DurableWorkItemRecord | null>>;
  listItems(
    context: RepositoryContext,
    filter?: DurableWorkListFilter,
  ): Promise<Result<DurableWorkItemRecord[]>>;
  listEvents(
    context: RepositoryContext,
    workItemId: string,
  ): Promise<Result<DurableWorkEventRecord[]>>;
}

export interface DurableWorkDeliveryCandidateReader {
  listDueCandidates(
    context: RepositoryContext,
    filter: DurableWorkDeliveryCandidateFilter,
  ): Promise<Result<DurableWorkItemRecord[]>>;
}

export interface DurableWorkClaimer {
  claimDue(
    context: RepositoryContext,
    input: DurableWorkClaimInput,
  ): Promise<Result<DurableWorkClaimResult>>;
}

export interface DurableWorkCompleter {
  complete(
    context: RepositoryContext,
    input: DurableWorkCompletionInput,
  ): Promise<Result<DurableWorkCompletionResult>>;
}

export interface DurableWorkHandlerResult {
  readonly status?: DurableWorkCompletionInput["status"];
  readonly phase?: string;
  readonly step?: string;
  readonly errorCode?: string;
  readonly errorCategory?: string;
  readonly retriable?: boolean;
  readonly nextAvailableAt?: string;
  readonly safeDetails?: Record<string, DurableWorkSafeValue>;
}

export interface DurableWorkHandler {
  handle(
    context: ExecutionContext,
    item: DurableWorkItemRecord,
    worker: DurableWorkWorkerIdentity,
  ): Promise<Result<DurableWorkHandlerResult>>;
}

export interface DurableWorkHandlerRegistry {
  resolve(item: DurableWorkItemRecord): DurableWorkHandler | undefined;
}

export interface DurableWorkDrainInput {
  readonly worker: DurableWorkWorkerIdentity;
  readonly now: string;
  readonly leaseDurationMs: number;
  readonly limit?: number;
  readonly kind?: string;
  readonly operationKey?: string;
}

export interface DurableWorkDrainReport {
  readonly scanned: number;
  readonly claimed: number;
  readonly completed: number;
  readonly failed: number;
  readonly skipped: number;
}

function addMilliseconds(timestamp: string, milliseconds: number): Result<string> {
  const base = Date.parse(timestamp);
  if (!Number.isFinite(base)) {
    return err(
      domainError.validation("Durable work drain timestamp is invalid", {
        phase: "durable-work-drain",
        field: "now",
      }),
    );
  }

  if (!Number.isInteger(milliseconds) || milliseconds <= 0) {
    return err(
      domainError.validation("Durable work lease duration must be a positive integer", {
        phase: "durable-work-drain",
        field: "leaseDurationMs",
      }),
    );
  }

  return ok(new Date(base + milliseconds).toISOString());
}

export async function drainDurableWorkOnce(
  context: ExecutionContext,
  adapter: DurableWorkQueueAdapter,
  handlers: DurableWorkHandlerRegistry,
  input: DurableWorkDrainInput,
): Promise<Result<DurableWorkDrainReport>> {
  const repositoryContext = toRepositoryContext(context);
  const leaseExpiresAt = addMilliseconds(input.now, input.leaseDurationMs);
  if (leaseExpiresAt.isErr()) {
    return err(leaseExpiresAt.error);
  }

  const candidates = await adapter.listDueCandidates(repositoryContext, {
    now: input.now,
    ...(input.kind ? { kind: input.kind } : {}),
    ...(input.operationKey ? { operationKey: input.operationKey } : {}),
    ...(input.limit ? { limit: input.limit } : {}),
  });
  if (candidates.isErr()) {
    return err(candidates.error);
  }

  let claimed = 0;
  let completed = 0;
  let failed = 0;
  let skipped = 0;

  for (const candidate of candidates.value) {
    const handler = handlers.resolve(candidate);
    if (!handler) {
      skipped += 1;
      continue;
    }

    const claim = await adapter.claimDue(repositoryContext, {
      workItemId: candidate.id,
      workerId: input.worker.workerId,
      workerGroup: input.worker.workerGroup,
      claimedAt: input.now,
      leaseExpiresAt: leaseExpiresAt.value,
    });
    if (claim.isErr()) {
      return err(claim.error);
    }

    if (claim.value.status !== "claimed") {
      skipped += 1;
      continue;
    }

    claimed += 1;

    try {
      const handled = await handler.handle(context, claim.value.workItem, input.worker);
      if (handled.isErr()) {
        const completion = await adapter.complete(repositoryContext, {
          workItemId: claim.value.workItem.id,
          status: "failed",
          completedAt: input.now,
          ...(claim.value.workItem.phase ? { phase: claim.value.workItem.phase } : {}),
          ...(claim.value.workItem.step ? { step: claim.value.workItem.step } : {}),
          errorCode: handled.error.code,
          errorCategory: handled.error.category,
          retriable: true,
        });
        if (completion.isErr()) {
          return err(completion.error);
        }
        failed += 1;
        continue;
      }

      const completion = await adapter.complete(repositoryContext, {
        workItemId: claim.value.workItem.id,
        status: handled.value.status ?? "succeeded",
        completedAt: input.now,
        ...(handled.value.phase ? { phase: handled.value.phase } : {}),
        ...(handled.value.step ? { step: handled.value.step } : {}),
        ...(handled.value.errorCode ? { errorCode: handled.value.errorCode } : {}),
        ...(handled.value.errorCategory ? { errorCategory: handled.value.errorCategory } : {}),
        ...(handled.value.retriable !== undefined ? { retriable: handled.value.retriable } : {}),
        ...(handled.value.nextAvailableAt
          ? { nextAvailableAt: handled.value.nextAvailableAt }
          : {}),
        ...(handled.value.safeDetails ? { safeDetails: handled.value.safeDetails } : {}),
      });
      if (completion.isErr()) {
        return err(completion.error);
      }

      completed += completion.value.status === "completed" ? 1 : 0;
    } catch (error) {
      const completion = await adapter.complete(repositoryContext, {
        workItemId: claim.value.workItem.id,
        status: "failed",
        completedAt: input.now,
        ...(claim.value.workItem.phase ? { phase: claim.value.workItem.phase } : {}),
        ...(claim.value.workItem.step ? { step: claim.value.workItem.step } : {}),
        errorCode: "durable_work_handler_failed",
        errorCategory: "async-processing",
        retriable: true,
        safeDetails: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      if (completion.isErr()) {
        return err(completion.error);
      }
      failed += 1;
    }
  }

  return ok({
    scanned: candidates.value.length,
    claimed,
    completed,
    failed,
    skipped,
  });
}

export function createDurableWorkTopology(
  config: DurableWorkRuntimeConfig,
): Result<DurableWorkTopology> {
  if (!Number.isInteger(config.workerCount) || config.workerCount < 0) {
    return err(
      domainError.validation("Durable work worker count must be a non-negative integer", {
        phase: "durable-work-topology",
        field: "workerCount",
      }),
    );
  }

  if (config.mode !== "disabled" && config.workerCount < 1) {
    return err(
      domainError.validation("Enabled durable work runtime requires at least one worker", {
        phase: "durable-work-topology",
        field: "workerCount",
        mode: config.mode,
      }),
    );
  }

  if (config.queueBackend === "external" && !config.externalBackendKind) {
    return err(
      domainError.validation("External durable work queue backend requires a backend kind", {
        phase: "durable-work-topology",
        field: "externalBackendKind",
      }),
    );
  }

  const workerGroup = config.workerGroup.trim();
  if (!workerGroup) {
    return err(
      domainError.validation("Durable work worker group is required", {
        phase: "durable-work-topology",
        field: "workerGroup",
      }),
    );
  }

  const workers =
    config.mode === "disabled"
      ? []
      : Array.from({ length: config.workerCount }, (_, index) => ({
          workerId: `${workerGroup}-${index + 1}`,
          workerGroup,
          slot: index + 1,
        }));

  return ok({
    mode: config.mode,
    queueBackend: config.queueBackend,
    workerGroup,
    expectedWorkerCount: workers.length,
    workers,
    coordinationRole: config.mode === "disabled" ? "disabled" : "coordinator",
  });
}

export function describeDurableWorkQueueBackend(
  config: Pick<DurableWorkRuntimeConfig, "queueBackend" | "externalBackendKind">,
): Result<DurableWorkQueueBackendDescriptor> {
  if (config.queueBackend === "database") {
    return ok({
      backend: "database",
      durableStateAuthority: "durable-work-ledger",
      supportsMultipleWorkers: true,
      supportsAtomicClaim: true,
    });
  }

  if (!config.externalBackendKind) {
    return err(
      domainError.validation("External durable work queue backend requires a backend kind", {
        phase: "durable-work-backend",
        field: "externalBackendKind",
      }),
    );
  }

  return ok({
    backend: "external",
    externalBackendKind: config.externalBackendKind,
    durableStateAuthority: "external-workflow-engine-with-process-attempt-projection",
    supportsMultipleWorkers: true,
    supportsAtomicClaim: true,
  });
}
