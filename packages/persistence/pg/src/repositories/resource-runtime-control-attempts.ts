import {
  appaloftTraceAttributes,
  createReadModelSpanName,
  type RepositoryContext,
  type ResourceRuntimeControlAttemptRecord,
  type ResourceRuntimeControlAttemptRecorder,
  type ResourceRuntimeControlBlockedReason,
  type ResourceRuntimeControlOperation,
  type ResourceRuntimeControlPhaseSummary,
  type ResourceRuntimeControlRuntimeState,
  type ResourceRuntimeControlStatus,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { type Insertable, type Kysely, type Selectable } from "kysely";

import { type Database, type ResourceRuntimeControlAttemptsTable } from "../schema";
import { normalizeTimestamp, resolveRepositoryExecutor } from "./shared";

type ResourceRuntimeControlAttemptRow = Selectable<ResourceRuntimeControlAttemptsTable>;
type PhaseStatus = ResourceRuntimeControlPhaseSummary["status"];
type JsonRecord = Record<string, unknown>;

const operations: ResourceRuntimeControlOperation[] = ["stop", "start", "restart"];
const statuses: ResourceRuntimeControlStatus[] = [
  "accepted",
  "running",
  "succeeded",
  "failed",
  "blocked",
];
const runtimeStates: ResourceRuntimeControlRuntimeState[] = [
  "starting",
  "running",
  "restarting",
  "stopping",
  "stopped",
  "unknown",
];
const blockedReasons: ResourceRuntimeControlBlockedReason[] = [
  "resource-archived",
  "resource-deleted",
  "runtime-not-found",
  "runtime-metadata-stale",
  "runtime-already-running",
  "runtime-already-stopped",
  "runtime-control-in-progress",
  "deployment-in-progress",
  "profile-acknowledgement-required",
  "adapter-unsupported",
];
const phaseStatuses: PhaseStatus[] = ["pending", "running", "succeeded", "failed", "skipped"];

function includes<T extends string>(values: readonly T[], value: string): value is T {
  return values.includes(value as T);
}

function rowOperation(value: string): ResourceRuntimeControlOperation {
  return includes(operations, value) ? value : "stop";
}

function rowStatus(value: string): ResourceRuntimeControlStatus {
  return includes(statuses, value) ? value : "failed";
}

function rowRuntimeState(value: string): ResourceRuntimeControlRuntimeState {
  return includes(runtimeStates, value) ? value : "unknown";
}

function rowBlockedReason(value: string | null): ResourceRuntimeControlBlockedReason | undefined {
  if (!value) {
    return undefined;
  }

  return includes(blockedReasons, value) ? value : undefined;
}

function isPhase(value: unknown): value is ResourceRuntimeControlPhaseSummary {
  if (!value || typeof value !== "object") {
    return false;
  }

  const phase = (value as { phase?: unknown }).phase;
  const status = (value as { status?: unknown }).status;
  if ((phase !== "stop" && phase !== "start") || typeof status !== "string") {
    return false;
  }

  return includes(phaseStatuses, status);
}

function normalizePhases(value: unknown): ResourceRuntimeControlPhaseSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isPhase).map((phase) => ({
    phase: phase.phase,
    status: phase.status,
    ...(phase.errorCode ? { errorCode: phase.errorCode } : {}),
  }));
}

function validateAttempt(attempt: ResourceRuntimeControlAttemptRecord): Result<void> {
  if (!attempt.runtimeControlAttemptId.trim()) {
    return err(
      domainError.validation("Runtime control attempt id is required", {
        phase: "runtime-control-attempt-validation",
        field: "runtimeControlAttemptId",
      }),
    );
  }

  if (!attempt.resourceId.trim()) {
    return err(
      domainError.validation("Runtime control resource id is required", {
        phase: "runtime-control-attempt-validation",
        field: "resourceId",
      }),
    );
  }

  return ok(undefined);
}

function toInsertable(
  attempt: ResourceRuntimeControlAttemptRecord,
): Insertable<ResourceRuntimeControlAttemptsTable> {
  return {
    id: attempt.runtimeControlAttemptId,
    resource_id: attempt.resourceId,
    deployment_id: attempt.deploymentId ?? null,
    server_id: attempt.serverId,
    destination_id: attempt.destinationId,
    operation: attempt.operation,
    status: attempt.status,
    runtime_state: attempt.runtimeState,
    blocked_reason: attempt.blockedReason ?? null,
    error_code: attempt.errorCode ?? null,
    phases: attempt.phases
      ? attempt.phases.map<JsonRecord>((phase) => ({
          phase: phase.phase,
          status: phase.status,
          ...(phase.errorCode ? { errorCode: phase.errorCode } : {}),
        }))
      : [],
    reason: attempt.reason ?? null,
    idempotency_key: attempt.idempotencyKey ?? null,
    started_at: attempt.startedAt,
    completed_at: attempt.completedAt ?? null,
    updated_at: attempt.completedAt ?? attempt.startedAt,
  };
}

export function rowToRuntimeControlAttempt(
  row: ResourceRuntimeControlAttemptRow,
): ResourceRuntimeControlAttemptRecord {
  const blockedReason = rowBlockedReason(row.blocked_reason);
  const phases = normalizePhases(row.phases);

  return {
    runtimeControlAttemptId: row.id,
    resourceId: row.resource_id,
    ...(row.deployment_id ? { deploymentId: row.deployment_id } : {}),
    serverId: row.server_id,
    destinationId: row.destination_id,
    operation: rowOperation(row.operation),
    status: rowStatus(row.status),
    startedAt: normalizeTimestamp(row.started_at) ?? row.started_at,
    ...(row.completed_at
      ? { completedAt: normalizeTimestamp(row.completed_at) ?? row.completed_at }
      : {}),
    runtimeState: rowRuntimeState(row.runtime_state),
    ...(blockedReason ? { blockedReason } : {}),
    ...(row.error_code ? { errorCode: row.error_code } : {}),
    ...(phases.length > 0 ? { phases } : {}),
    ...(row.reason ? { reason: row.reason } : {}),
    ...(row.idempotency_key ? { idempotencyKey: row.idempotency_key } : {}),
  };
}

function persistenceError(message: string, error: unknown) {
  return domainError.infra(message, {
    phase: "resource-runtime-control-attempt-persistence",
    adapter: "persistence.pg",
    errorMessage: error instanceof Error ? error.message : String(error),
  });
}

export class PgResourceRuntimeControlAttemptRecorder
  implements ResourceRuntimeControlAttemptRecorder
{
  constructor(private readonly db: Kysely<Database>) {}

  async record(
    context: RepositoryContext,
    attempt: ResourceRuntimeControlAttemptRecord,
  ): Promise<Result<ResourceRuntimeControlAttemptRecord>> {
    const validation = validateAttempt(attempt);
    if (validation.isErr()) {
      return err(validation.error);
    }

    const values = toInsertable(attempt);
    const executor = resolveRepositoryExecutor(this.db, context);

    try {
      const row = await context.tracer.startActiveSpan(
        createReadModelSpanName("resource-runtime-control-attempt", "record"),
        {
          attributes: {
            [appaloftTraceAttributes.readModelName]: "resource-runtime-control-attempt",
            [appaloftTraceAttributes.resourceId]: attempt.resourceId,
          },
        },
        async () =>
          executor
            .insertInto("resource_runtime_control_attempts")
            .values(values)
            .onConflict((conflict) =>
              conflict.column("id").doUpdateSet({
                resource_id: values.resource_id,
                deployment_id: values.deployment_id,
                server_id: values.server_id,
                destination_id: values.destination_id,
                operation: values.operation,
                status: values.status,
                runtime_state: values.runtime_state,
                blocked_reason: values.blocked_reason,
                error_code: values.error_code,
                phases: values.phases,
                reason: values.reason,
                idempotency_key: values.idempotency_key,
                started_at: values.started_at,
                completed_at: values.completed_at,
                updated_at: values.updated_at,
              }),
            )
            .returningAll()
            .executeTakeFirstOrThrow(),
      );

      return ok(rowToRuntimeControlAttempt(row));
    } catch (error) {
      return err(persistenceError("Runtime control attempt could not be recorded", error));
    }
  }
}
