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
    | "process-attempt-journal"
    | "external-workflow-engine-with-process-attempt-projection";
  readonly supportsMultipleWorkers: boolean;
  readonly supportsAtomicClaim: boolean;
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
      durableStateAuthority: "process-attempt-journal",
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
