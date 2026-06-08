import { domainError, err, ok, type Result } from "@appaloft/core";
import {
  type ProcessAttemptClaimer,
  type ProcessAttemptCompleter,
  type ProcessAttemptDeliveryCandidateReader,
  type ProcessAttemptReadModel,
  type ProcessAttemptRecorder,
  type ProcessAttemptRetryCandidateReader,
  type ProcessAttemptRetryGenerator,
} from "./ports";

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

export interface DurableWorkTopology {
  readonly mode: DurableWorkRuntimeMode;
  readonly queueBackend: DurableWorkQueueBackend;
  readonly workerGroup: string;
  readonly expectedWorkerCount: number;
  readonly workers: readonly DurableWorkWorkerIdentity[];
  readonly coordinationRole: "coordinator" | "worker" | "disabled";
}

export interface DurableWorkQueueAdapter
  extends ProcessAttemptRecorder,
    ProcessAttemptReadModel,
    ProcessAttemptDeliveryCandidateReader,
    ProcessAttemptRetryCandidateReader,
    ProcessAttemptRetryGenerator,
    ProcessAttemptClaimer,
    ProcessAttemptCompleter {}

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

export interface DurableWorkLedger {
  recordItem(item: DurableWorkItemRecord): Promise<Result<DurableWorkItemRecord>>;
  appendEvent(event: DurableWorkEventRecord): Promise<Result<DurableWorkEventRecord>>;
  findItem(id: string): Promise<Result<DurableWorkItemRecord | null>>;
  listEvents(workItemId: string): Promise<Result<DurableWorkEventRecord[]>>;
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
