import {
  appaloftTraceAttributes,
  createReadModelSpanName,
  operatorWorkKinds,
  operatorWorkNextActions,
  operatorWorkStatuses,
  type ProcessAttemptKind,
  type ProcessAttemptListFilter,
  type ProcessAttemptNextAction,
  type ProcessAttemptReadModel,
  type ProcessAttemptRecord,
  type ProcessAttemptRecorder,
  type ProcessAttemptStatus,
  type RepositoryContext,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { type Insertable, type Kysely, type Selectable } from "kysely";

import { type Database, type ProcessAttemptJournalTable } from "../schema";
import { resolveRepositoryExecutor } from "./shared";

type ProcessAttemptRow = Selectable<ProcessAttemptJournalTable>;
type SafeDetailValue = string | number | boolean | null;

const secretKeyPattern =
  /secret|password|passphrase|private[_-]?key|token|credential|command[_-]?line|commandline/i;
const secretValuePattern = /(BEGIN .*PRIVATE KEY|PRIVATE_KEY|SECRET_|PASSWORD=|TOKEN=|PASS=)/i;

function isProcessAttemptKind(value: string): value is ProcessAttemptKind {
  return operatorWorkKinds.includes(value as ProcessAttemptKind);
}

function isProcessAttemptStatus(value: string): value is ProcessAttemptStatus {
  return operatorWorkStatuses.includes(value as ProcessAttemptStatus);
}

function isProcessAttemptNextAction(value: string): value is ProcessAttemptNextAction {
  return operatorWorkNextActions.includes(value as ProcessAttemptNextAction);
}

function normalizeTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

function sanitizeSafeDetails(
  details?: Record<string, SafeDetailValue>,
): Record<string, SafeDetailValue> {
  if (!details) {
    return {};
  }

  const sanitized: Record<string, SafeDetailValue> = {};
  for (const [key, value] of Object.entries(details)) {
    if (secretKeyPattern.test(key)) {
      continue;
    }

    if (typeof value === "string" && secretValuePattern.test(value)) {
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
}

function validateAttempt(attempt: ProcessAttemptRecord): Result<void> {
  if (!attempt.id.trim()) {
    return err(
      domainError.validation("Process attempt id is required", {
        phase: "process-attempt-validation",
        field: "id",
      }),
    );
  }

  if (!attempt.operationKey.trim()) {
    return err(
      domainError.validation("Process attempt operation key is required", {
        phase: "process-attempt-validation",
        field: "operationKey",
      }),
    );
  }

  for (const action of attempt.nextActions) {
    if (!isProcessAttemptNextAction(action)) {
      return err(
        domainError.validation("Process attempt next action is not supported", {
          phase: "process-attempt-validation",
          field: "nextActions",
          nextAction: action,
        }),
      );
    }
  }

  return ok(undefined);
}

function rowToRecord(row: ProcessAttemptRow): ProcessAttemptRecord {
  const nextActions = Array.isArray(row.next_actions)
    ? row.next_actions.filter((action): action is ProcessAttemptNextAction =>
        isProcessAttemptNextAction(String(action)),
      )
    : [];
  const safeDetails =
    row.safe_details && typeof row.safe_details === "object"
      ? sanitizeSafeDetails(row.safe_details as Record<string, SafeDetailValue>)
      : {};
  const kind = isProcessAttemptKind(row.kind) ? row.kind : "system";
  const status = isProcessAttemptStatus(row.status) ? row.status : "unknown";

  return {
    id: row.id,
    kind,
    status,
    operationKey: row.operation_key,
    ...(row.dedupe_key ? { dedupeKey: row.dedupe_key } : {}),
    ...(row.correlation_id ? { correlationId: row.correlation_id } : {}),
    ...(row.request_id ? { requestId: row.request_id } : {}),
    ...(row.phase ? { phase: row.phase } : {}),
    ...(row.step ? { step: row.step } : {}),
    ...(row.project_id ? { projectId: row.project_id } : {}),
    ...(row.resource_id ? { resourceId: row.resource_id } : {}),
    ...(row.deployment_id ? { deploymentId: row.deployment_id } : {}),
    ...(row.server_id ? { serverId: row.server_id } : {}),
    ...(row.domain_binding_id ? { domainBindingId: row.domain_binding_id } : {}),
    ...(row.certificate_id ? { certificateId: row.certificate_id } : {}),
    ...(row.started_at ? { startedAt: normalizeTimestamp(row.started_at) } : {}),
    updatedAt: normalizeTimestamp(row.updated_at),
    ...(row.finished_at ? { finishedAt: normalizeTimestamp(row.finished_at) } : {}),
    ...(row.error_code ? { errorCode: row.error_code } : {}),
    ...(row.error_category ? { errorCategory: row.error_category } : {}),
    ...(row.retriable === null ? {} : { retriable: row.retriable }),
    ...(row.next_eligible_at ? { nextEligibleAt: normalizeTimestamp(row.next_eligible_at) } : {}),
    nextActions,
    ...(Object.keys(safeDetails).length > 0 ? { safeDetails } : {}),
  };
}

function toInsertable(attempt: ProcessAttemptRecord): Insertable<ProcessAttemptJournalTable> {
  return {
    id: attempt.id,
    kind: attempt.kind,
    status: attempt.status,
    operation_key: attempt.operationKey,
    dedupe_key: attempt.dedupeKey ?? null,
    correlation_id: attempt.correlationId ?? null,
    request_id: attempt.requestId ?? null,
    phase: attempt.phase ?? null,
    step: attempt.step ?? null,
    project_id: attempt.projectId ?? null,
    resource_id: attempt.resourceId ?? null,
    deployment_id: attempt.deploymentId ?? null,
    server_id: attempt.serverId ?? null,
    domain_binding_id: attempt.domainBindingId ?? null,
    certificate_id: attempt.certificateId ?? null,
    started_at: attempt.startedAt ?? null,
    updated_at: attempt.updatedAt,
    finished_at: attempt.finishedAt ?? null,
    error_code: attempt.errorCode ?? null,
    error_category: attempt.errorCategory ?? null,
    retriable: attempt.retriable ?? null,
    next_eligible_at: attempt.nextEligibleAt ?? null,
    next_actions: attempt.nextActions,
    safe_details: sanitizeSafeDetails(attempt.safeDetails),
  };
}

function mergeProcessAttempt(
  existing: ProcessAttemptRecord | null,
  next: ProcessAttemptRecord,
): ProcessAttemptRecord {
  if (!existing) {
    return next;
  }

  const dedupeKey = next.dedupeKey ?? existing.dedupeKey;
  const correlationId = next.correlationId ?? existing.correlationId;
  const requestId = next.requestId ?? existing.requestId;
  const phase = next.phase ?? existing.phase;
  const step = next.step ?? existing.step;
  const projectId = next.projectId ?? existing.projectId;
  const resourceId = next.resourceId ?? existing.resourceId;
  const deploymentId = next.deploymentId ?? existing.deploymentId;
  const serverId = next.serverId ?? existing.serverId;
  const domainBindingId = next.domainBindingId ?? existing.domainBindingId;
  const certificateId = next.certificateId ?? existing.certificateId;
  const startedAt = next.startedAt ?? existing.startedAt;
  const finishedAt = next.finishedAt ?? existing.finishedAt;
  const errorCode = next.errorCode ?? existing.errorCode;
  const errorCategory = next.errorCategory ?? existing.errorCategory;
  const retriable = next.retriable ?? existing.retriable;
  const nextEligibleAt = next.nextEligibleAt ?? existing.nextEligibleAt;
  const safeDetails = {
    ...(existing.safeDetails ?? {}),
    ...(next.safeDetails ?? {}),
  };

  return {
    id: next.id,
    kind: next.kind,
    status: next.status,
    operationKey: next.operationKey,
    updatedAt: next.updatedAt,
    nextActions: next.nextActions,
    ...(dedupeKey ? { dedupeKey } : {}),
    ...(correlationId ? { correlationId } : {}),
    ...(requestId ? { requestId } : {}),
    ...(phase ? { phase } : {}),
    ...(step ? { step } : {}),
    ...(projectId ? { projectId } : {}),
    ...(resourceId ? { resourceId } : {}),
    ...(deploymentId ? { deploymentId } : {}),
    ...(serverId ? { serverId } : {}),
    ...(domainBindingId ? { domainBindingId } : {}),
    ...(certificateId ? { certificateId } : {}),
    ...(startedAt ? { startedAt } : {}),
    ...(finishedAt ? { finishedAt } : {}),
    ...(errorCode ? { errorCode } : {}),
    ...(errorCategory ? { errorCategory } : {}),
    ...(retriable === undefined ? {} : { retriable }),
    ...(nextEligibleAt ? { nextEligibleAt } : {}),
    ...(Object.keys(safeDetails).length > 0 ? { safeDetails } : {}),
  };
}

function persistenceError(message: string, error: unknown) {
  return domainError.infra(message, {
    phase: "process-attempt-persistence",
    adapter: "persistence.pg",
    errorMessage: error instanceof Error ? error.message : String(error),
  });
}

export class PgProcessAttemptJournal implements ProcessAttemptRecorder, ProcessAttemptReadModel {
  constructor(private readonly db: Kysely<Database>) {}

  async record(
    context: RepositoryContext,
    attempt: ProcessAttemptRecord,
  ): Promise<Result<ProcessAttemptRecord>> {
    const validation = validateAttempt(attempt);
    if (validation.isErr()) {
      return err(validation.error);
    }

    const executor = resolveRepositoryExecutor(this.db, context);

    try {
      const existingRow = await executor
        .selectFrom("process_attempt_journal")
        .selectAll()
        .where("id", "=", attempt.id)
        .executeTakeFirst();
      const values = toInsertable(
        mergeProcessAttempt(existingRow ? rowToRecord(existingRow) : null, attempt),
      );
      const row = await executor
        .insertInto("process_attempt_journal")
        .values(values)
        .onConflict((conflict) =>
          conflict.column("id").doUpdateSet({
            kind: values.kind,
            status: values.status,
            operation_key: values.operation_key,
            dedupe_key: values.dedupe_key,
            correlation_id: values.correlation_id,
            request_id: values.request_id,
            phase: values.phase,
            step: values.step,
            project_id: values.project_id,
            resource_id: values.resource_id,
            deployment_id: values.deployment_id,
            server_id: values.server_id,
            domain_binding_id: values.domain_binding_id,
            certificate_id: values.certificate_id,
            started_at: values.started_at,
            updated_at: values.updated_at,
            finished_at: values.finished_at,
            error_code: values.error_code,
            error_category: values.error_category,
            retriable: values.retriable,
            next_eligible_at: values.next_eligible_at,
            next_actions: values.next_actions,
            safe_details: values.safe_details,
          }),
        )
        .returningAll()
        .executeTakeFirstOrThrow();

      return ok(rowToRecord(row));
    } catch (error) {
      return err(persistenceError("Process attempt could not be recorded", error));
    }
  }

  async list(
    context: RepositoryContext,
    filter?: ProcessAttemptListFilter,
  ): Promise<ProcessAttemptRecord[]> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("process-attempt", "list"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "process-attempt",
        },
      },
      async () => {
        let query = executor
          .selectFrom("process_attempt_journal")
          .selectAll()
          .orderBy("updated_at", "desc")
          .limit(filter?.limit ?? 50);

        if (filter?.kind) {
          query = query.where("kind", "=", filter.kind);
        }

        if (filter?.status) {
          query = query.where("status", "=", filter.status);
        }

        if (filter?.resourceId) {
          query = query.where("resource_id", "=", filter.resourceId);
        }

        if (filter?.serverId) {
          query = query.where("server_id", "=", filter.serverId);
        }

        if (filter?.deploymentId) {
          query = query.where("deployment_id", "=", filter.deploymentId);
        }

        const rows = await query.execute();
        return rows.map(rowToRecord);
      },
    );
  }

  async findOne(context: RepositoryContext, id: string): Promise<ProcessAttemptRecord | null> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const row = await executor
      .selectFrom("process_attempt_journal")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return row ? rowToRecord(row) : null;
  }
}
