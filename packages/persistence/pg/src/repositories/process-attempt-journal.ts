import {
  appaloftTraceAttributes,
  createReadModelSpanName,
  operatorWorkKinds,
  operatorWorkNextActions,
  operatorWorkStatuses,
  type ProcessAttemptClaimer,
  type ProcessAttemptClaimInput,
  type ProcessAttemptClaimResult,
  type ProcessAttemptCompleter,
  type ProcessAttemptCompletionInput,
  type ProcessAttemptCompletionResult,
  type ProcessAttemptDeliveryCandidateFilter,
  type ProcessAttemptDeliveryCandidateReader,
  type ProcessAttemptKind,
  type ProcessAttemptListFilter,
  type ProcessAttemptNextAction,
  type ProcessAttemptPruneInput,
  type ProcessAttemptPruneResult,
  type ProcessAttemptReadModel,
  type ProcessAttemptRecord,
  type ProcessAttemptRecorder,
  type ProcessAttemptRecoveryRecorder,
  type ProcessAttemptRetryCandidateFilter,
  type ProcessAttemptRetryCandidateReader,
  type ProcessAttemptRetryGenerationInput,
  type ProcessAttemptRetryGenerationResult,
  type ProcessAttemptRetryGenerator,
  type ProcessAttemptStatus,
  type PrunableProcessAttemptStatus,
  type RepositoryContext,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { type Insertable, type Kysely, type Selectable } from "kysely";

import { type Database, type ProcessAttemptJournalTable } from "../schema";
import { resolveRepositoryExecutor, withRepositoryTransaction } from "./shared";

type ProcessAttemptRow = Selectable<ProcessAttemptJournalTable>;
type SafeDetailValue = string | number | boolean | null;

const secretKeyPattern =
  /secret|password|passphrase|private[_-]?key|token|credential|command[_-]?line|commandline/i;
const secretValuePattern = /(BEGIN .*PRIVATE KEY|PRIVATE_KEY|SECRET_|PASSWORD=|TOKEN=|PASS=)/i;

const prunableStatusSet: ReadonlySet<ProcessAttemptStatus> = new Set([
  "succeeded",
  "failed",
  "canceled",
  "dead-lettered",
]);

function isProcessAttemptKind(value: string): value is ProcessAttemptKind {
  return operatorWorkKinds.includes(value as ProcessAttemptKind);
}

function isProcessAttemptStatus(value: string): value is ProcessAttemptStatus {
  return operatorWorkStatuses.includes(value as ProcessAttemptStatus);
}

function isProcessAttemptNextAction(value: string): value is ProcessAttemptNextAction {
  return operatorWorkNextActions.includes(value as ProcessAttemptNextAction);
}

function isPrunableProcessAttemptStatus(value: string): value is PrunableProcessAttemptStatus {
  return prunableStatusSet.has(value as ProcessAttemptStatus);
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

function safeDetailString(
  details: Record<string, SafeDetailValue> | undefined,
  key: string,
): string | undefined {
  const value = details?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
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

function emptyPruneCounts(): Partial<Record<PrunableProcessAttemptStatus, number>> {
  return {};
}

function attemptIsDueRetryCandidate(
  attempt: ProcessAttemptRecord,
  latestByDedupeKey: Map<string, ProcessAttemptRecord>,
  filter: ProcessAttemptRetryCandidateFilter,
): boolean {
  if (attempt.status !== "retry-scheduled" || !attempt.nextEligibleAt) {
    return false;
  }

  if (filter.kind && attempt.kind !== filter.kind) {
    return false;
  }

  if (attempt.nextEligibleAt.localeCompare(filter.now) > 0) {
    return false;
  }

  if (!attempt.dedupeKey) {
    return true;
  }

  return latestByDedupeKey.get(attempt.dedupeKey)?.id === attempt.id;
}

function attemptIsDueDeliveryCandidate(
  attempt: ProcessAttemptRecord,
  filter: ProcessAttemptDeliveryCandidateFilter,
): boolean {
  if (attempt.status !== "pending" && attempt.status !== "retry-scheduled") {
    return false;
  }

  if (attempt.status === "retry-scheduled" && attempt.retriable !== true) {
    return false;
  }

  if (attempt.status === "retry-scheduled" && !attempt.nextEligibleAt) {
    return false;
  }

  if (filter.kind && attempt.kind !== filter.kind) {
    return false;
  }

  if (filter.operationKey && attempt.operationKey !== filter.operationKey) {
    return false;
  }

  return !attempt.nextEligibleAt || attempt.nextEligibleAt.localeCompare(filter.now) <= 0;
}

function dueDeliveryCandidateOrder(
  left: ProcessAttemptRecord,
  right: ProcessAttemptRecord,
): number {
  const leftEligible = left.nextEligibleAt ?? left.updatedAt;
  const rightEligible = right.nextEligibleAt ?? right.updatedAt;
  const eligibleOrder = leftEligible.localeCompare(rightEligible);
  return eligibleOrder === 0 ? left.updatedAt.localeCompare(right.updatedAt) : eligibleOrder;
}

function isClaimableAttempt(attempt: ProcessAttemptRecord): boolean {
  return attempt.status === "pending" || attempt.status === "retry-scheduled";
}

function isDueForClaim(attempt: ProcessAttemptRecord, claimedAt: string): boolean {
  return !attempt.nextEligibleAt || attempt.nextEligibleAt.localeCompare(claimedAt) <= 0;
}

function alreadyClaimedResult(attempt: ProcessAttemptRecord): ProcessAttemptClaimResult {
  return {
    status: "already-claimed",
    attempt,
  };
}

function refusedClaimResult(
  attempt: ProcessAttemptRecord,
  claimedAt: string,
): ProcessAttemptClaimResult {
  if (attempt.status === "running") {
    return alreadyClaimedResult(attempt);
  }

  if (!isClaimableAttempt(attempt)) {
    return {
      status: "not-claimable",
      attempt,
    };
  }

  if (!isDueForClaim(attempt, claimedAt)) {
    return {
      status: "not-due",
      attempt,
    };
  }

  return alreadyClaimedResult(attempt);
}

export class PgProcessAttemptJournal
  implements
    ProcessAttemptRecorder,
    ProcessAttemptRecoveryRecorder,
    ProcessAttemptReadModel,
    ProcessAttemptRetryCandidateReader,
    ProcessAttemptDeliveryCandidateReader,
    ProcessAttemptRetryGenerator,
    ProcessAttemptClaimer,
    ProcessAttemptCompleter
{
  constructor(private readonly db: Kysely<Database>) {}

  private async overwriteTerminalAttempt(
    context: RepositoryContext,
    attempt: ProcessAttemptRecord,
    input: {
      missingMessage: string;
      persistenceMessage: string;
    },
  ): Promise<Result<ProcessAttemptRecord>> {
    const validation = validateAttempt(attempt);
    if (validation.isErr()) {
      return err(validation.error);
    }

    const executor = resolveRepositoryExecutor(this.db, context);
    const values = toInsertable(attempt);

    try {
      const row = await executor
        .updateTable("process_attempt_journal")
        .set({
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
          error_code: null,
          error_category: null,
          retriable: false,
          next_eligible_at: null,
          next_actions: values.next_actions,
          safe_details: values.safe_details,
        })
        .where("id", "=", attempt.id)
        .returningAll()
        .executeTakeFirst();

      if (!row) {
        return err(
          domainError.operatorWorkNotFound(input.missingMessage, {
            phase: "process-attempt-persistence",
            workId: attempt.id,
          }),
        );
      }

      return ok(rowToRecord(row));
    } catch (error) {
      return err(persistenceError(input.persistenceMessage, error));
    }
  }

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
      const existingQuery = executor.selectFrom("process_attempt_journal").selectAll();
      const existingRow = await (attempt.dedupeKey
        ? existingQuery
            .where((builder) =>
              builder.or([
                builder("id", "=", attempt.id),
                builder("dedupe_key", "=", attempt.dedupeKey ?? ""),
              ]),
            )
            .orderBy("updated_at", "desc")
            .executeTakeFirst()
        : existingQuery.where("id", "=", attempt.id).executeTakeFirst());
      const values = toInsertable(
        mergeProcessAttempt(existingRow ? rowToRecord(existingRow) : null, attempt),
      );
      const row = existingRow
        ? await executor
            .updateTable("process_attempt_journal")
            .set(values)
            .where("id", "=", existingRow.id)
            .returningAll()
            .executeTakeFirstOrThrow()
        : await executor
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

  async markRecovered(
    context: RepositoryContext,
    attempt: ProcessAttemptRecord,
  ): Promise<Result<ProcessAttemptRecord>> {
    return this.overwriteTerminalAttempt(context, attempt, {
      missingMessage: "Process attempt could not be recovered",
      persistenceMessage: "Process attempt could not be recovered",
    });
  }

  async deadLetter(
    context: RepositoryContext,
    attempt: ProcessAttemptRecord,
  ): Promise<Result<ProcessAttemptRecord>> {
    return this.overwriteTerminalAttempt(context, attempt, {
      missingMessage: "Process attempt could not be dead-lettered",
      persistenceMessage: "Process attempt could not be dead-lettered",
    });
  }

  async cancel(
    context: RepositoryContext,
    attempt: ProcessAttemptRecord,
  ): Promise<Result<ProcessAttemptRecord>> {
    return this.overwriteTerminalAttempt(context, attempt, {
      missingMessage: "Process attempt could not be canceled",
      persistenceMessage: "Process attempt could not be canceled",
    });
  }

  async retry(
    context: RepositoryContext,
    attempt: ProcessAttemptRecord,
  ): Promise<Result<ProcessAttemptRecord>> {
    const validation = validateAttempt(attempt);
    if (validation.isErr()) {
      return err(validation.error);
    }

    const executor = resolveRepositoryExecutor(this.db, context);
    const values = toInsertable(attempt);
    const retryOfWorkId = safeDetailString(attempt.safeDetails, "retryOfWorkId");

    try {
      if (retryOfWorkId) {
        await executor
          .updateTable("process_attempt_journal")
          .set({
            retriable: false,
            next_eligible_at: null,
            next_actions: ["no-action"],
          })
          .where("id", "=", retryOfWorkId)
          .execute();
      }

      const row = await executor
        .insertInto("process_attempt_journal")
        .values({
          ...values,
          finished_at: null,
          error_code: null,
          error_category: null,
          retriable: false,
          next_eligible_at: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return ok(rowToRecord(row));
    } catch (error) {
      return err(persistenceError("Process attempt retry could not be recorded", error));
    }
  }

  async prune(
    context: RepositoryContext,
    input: ProcessAttemptPruneInput,
  ): Promise<Result<ProcessAttemptPruneResult>> {
    const statuses = input.statuses.filter(isPrunableProcessAttemptStatus);
    if (statuses.length === 0) {
      return err(
        domainError.validation("At least one prunable process attempt status is required", {
          phase: "process-attempt-persistence",
          field: "statuses",
        }),
      );
    }

    const executor = resolveRepositoryExecutor(this.db, context);

    try {
      const rows = await executor
        .selectFrom("process_attempt_journal")
        .select(["id", "status"])
        .where("status", "in", statuses)
        .where("updated_at", "<", input.before)
        .execute();
      const countsByStatus = emptyPruneCounts();

      for (const row of rows) {
        const status = String(row.status);
        if (isPrunableProcessAttemptStatus(status)) {
          countsByStatus[status] = (countsByStatus[status] ?? 0) + 1;
        }
      }

      if (input.dryRun || rows.length === 0) {
        return ok({
          matchedCount: rows.length,
          prunedCount: 0,
          countsByStatus,
        });
      }

      const ids = rows.map((row) => row.id);
      const deletedRows = await executor
        .deleteFrom("process_attempt_journal")
        .where("id", "in", ids)
        .returning("id")
        .execute();

      return ok({
        matchedCount: rows.length,
        prunedCount: deletedRows.length,
        countsByStatus,
      });
    } catch (error) {
      return err(persistenceError("Process attempt prune could not be completed", error));
    }
  }

  async claimDue(
    context: RepositoryContext,
    input: ProcessAttemptClaimInput,
  ): Promise<Result<ProcessAttemptClaimResult>> {
    if (!input.attemptId.trim()) {
      return err(
        domainError.validation("Process attempt id is required", {
          phase: "process-attempt-claim",
          field: "attemptId",
        }),
      );
    }

    if (!input.workerId.trim()) {
      return err(
        domainError.validation("Process attempt claim worker id is required", {
          phase: "process-attempt-claim",
          field: "workerId",
        }),
      );
    }

    const executor = resolveRepositoryExecutor(this.db, context);

    try {
      const existingRow = await executor
        .selectFrom("process_attempt_journal")
        .selectAll()
        .where("id", "=", input.attemptId)
        .executeTakeFirst();

      if (!existingRow) {
        return ok({
          status: "not-found",
          attemptId: input.attemptId,
        });
      }

      const existing = rowToRecord(existingRow);
      if (!isClaimableAttempt(existing) || !isDueForClaim(existing, input.claimedAt)) {
        return ok(refusedClaimResult(existing, input.claimedAt));
      }

      const safeDetails = sanitizeSafeDetails({
        ...(existing.safeDetails ?? {}),
        ...(input.safeDetails ?? {}),
        claimedAt: input.claimedAt,
        claimedBy: input.workerId,
      });

      const row = await executor
        .updateTable("process_attempt_journal")
        .set({
          status: "running",
          phase: "worker-claim",
          step: "claimed",
          updated_at: input.claimedAt,
          retriable: false,
          next_eligible_at: null,
          next_actions: ["no-action"],
          safe_details: safeDetails,
        })
        .where("id", "=", input.attemptId)
        .where("status", "in", ["pending", "retry-scheduled"])
        .where((builder) =>
          builder.or([
            builder("next_eligible_at", "is", null),
            builder("next_eligible_at", "<=", input.claimedAt),
          ]),
        )
        .returningAll()
        .executeTakeFirst();

      if (row) {
        return ok({
          status: "claimed",
          attempt: rowToRecord(row),
        });
      }

      const current = await this.findOne(context, input.attemptId);
      if (!current) {
        return ok({
          status: "not-found",
          attemptId: input.attemptId,
        });
      }

      return ok(refusedClaimResult(current, input.claimedAt));
    } catch (error) {
      return err(persistenceError("Process attempt could not be claimed", error));
    }
  }

  async complete(
    context: RepositoryContext,
    input: ProcessAttemptCompletionInput,
  ): Promise<Result<ProcessAttemptCompletionResult>> {
    if (!input.attemptId.trim()) {
      return err(
        domainError.validation("Process attempt id is required", {
          phase: "process-attempt-completion",
          field: "attemptId",
        }),
      );
    }

    for (const action of input.nextActions) {
      if (!isProcessAttemptNextAction(action)) {
        return err(
          domainError.validation("Process attempt next action is not supported", {
            phase: "process-attempt-completion",
            field: "nextActions",
            nextAction: action,
          }),
        );
      }
    }

    const executor = resolveRepositoryExecutor(this.db, context);

    try {
      const existingRow = await executor
        .selectFrom("process_attempt_journal")
        .selectAll()
        .where("id", "=", input.attemptId)
        .executeTakeFirst();

      if (!existingRow) {
        return ok({
          status: "not-found",
          attemptId: input.attemptId,
        });
      }

      const existing = rowToRecord(existingRow);
      if (existing.status !== "running") {
        return ok({
          status: "not-running",
          attempt: existing,
        });
      }

      const safeDetails = sanitizeSafeDetails({
        ...(existing.safeDetails ?? {}),
        ...(input.safeDetails ?? {}),
      });
      const row = await executor
        .updateTable("process_attempt_journal")
        .set({
          status: input.status,
          phase: input.phase ?? existing.phase ?? null,
          step: input.step ?? existing.step ?? null,
          updated_at: input.completedAt,
          finished_at: input.completedAt,
          error_code: input.errorCode ?? null,
          error_category: input.errorCategory ?? null,
          retriable: input.retriable ?? input.status === "retry-scheduled",
          next_eligible_at:
            input.status === "retry-scheduled" ? (input.nextEligibleAt ?? null) : null,
          next_actions: input.nextActions,
          safe_details: safeDetails,
        })
        .where("id", "=", input.attemptId)
        .where("status", "=", "running")
        .returningAll()
        .executeTakeFirst();

      if (row) {
        return ok({
          status: "completed",
          attempt: rowToRecord(row),
        });
      }

      const current = await this.findOne(context, input.attemptId);
      if (!current) {
        return ok({
          status: "not-found",
          attemptId: input.attemptId,
        });
      }

      return ok({
        status: "not-running",
        attempt: current,
      });
    } catch (error) {
      return err(persistenceError("Process attempt could not be completed", error));
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

  async listDueRetries(
    context: RepositoryContext,
    filter: ProcessAttemptRetryCandidateFilter,
  ): Promise<ProcessAttemptRecord[]> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("process-attempt", "list_due_retries"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "process-attempt",
        },
      },
      async () => {
        let query = executor
          .selectFrom("process_attempt_journal")
          .selectAll()
          .where((builder) =>
            builder.or([
              builder("status", "=", "retry-scheduled"),
              builder("dedupe_key", "is not", null),
            ]),
          )
          .orderBy("updated_at", "desc");

        if (filter.kind) {
          query = query.where("kind", "=", filter.kind);
        }

        const rows = await query.execute();
        const attempts = rows.map(rowToRecord);
        const latestByDedupeKey = new Map<string, ProcessAttemptRecord>();

        for (const attempt of attempts) {
          if (attempt.dedupeKey && !latestByDedupeKey.has(attempt.dedupeKey)) {
            latestByDedupeKey.set(attempt.dedupeKey, attempt);
          }
        }

        return attempts
          .filter((attempt) => attemptIsDueRetryCandidate(attempt, latestByDedupeKey, filter))
          .sort((left, right) => {
            const leftEligible = left.nextEligibleAt ?? left.updatedAt;
            const rightEligible = right.nextEligibleAt ?? right.updatedAt;
            const eligibleOrder = leftEligible.localeCompare(rightEligible);
            return eligibleOrder === 0
              ? right.updatedAt.localeCompare(left.updatedAt)
              : eligibleOrder;
          })
          .slice(0, filter.limit ?? 50);
      },
    );
  }

  async generateDueRetry(
    context: RepositoryContext,
    input: ProcessAttemptRetryGenerationInput,
  ): Promise<Result<ProcessAttemptRetryGenerationResult>> {
    if (!input.sourceAttemptId.trim()) {
      return err(
        domainError.validation("Process attempt source id is required", {
          phase: "process-attempt-retry-generation",
          field: "sourceAttemptId",
        }),
      );
    }

    if (!input.retryAttemptId.trim()) {
      return err(
        domainError.validation("Process attempt retry id is required", {
          phase: "process-attempt-retry-generation",
          field: "retryAttemptId",
        }),
      );
    }

    try {
      return await withRepositoryTransaction(this.db, context, async (executor) => {
        const sourceRow = await executor
          .selectFrom("process_attempt_journal")
          .selectAll()
          .where("id", "=", input.sourceAttemptId)
          .executeTakeFirst();

        if (!sourceRow) {
          return ok({
            status: "not-found",
            sourceAttemptId: input.sourceAttemptId,
          });
        }

        const sourceAttempt = rowToRecord(sourceRow);
        if (sourceAttempt.status !== "retry-scheduled" || sourceAttempt.retriable !== true) {
          return ok({
            status: "not-retriable",
            sourceAttempt,
          });
        }

        if (
          !sourceAttempt.nextEligibleAt ||
          sourceAttempt.nextEligibleAt.localeCompare(input.generatedAt) > 0
        ) {
          return ok({
            status: "not-due",
            sourceAttempt,
          });
        }

        if (sourceAttempt.dedupeKey) {
          const latestRow = await executor
            .selectFrom("process_attempt_journal")
            .selectAll()
            .where("dedupe_key", "=", sourceAttempt.dedupeKey)
            .orderBy("updated_at", "desc")
            .executeTakeFirst();
          const latestAttempt = latestRow ? rowToRecord(latestRow) : sourceAttempt;

          if (latestAttempt.id !== sourceAttempt.id) {
            return ok({
              status: "stale-generation",
              sourceAttempt,
              latestAttempt,
            });
          }
        }

        const safeDetails = sanitizeSafeDetails({
          ...(sourceAttempt.safeDetails ?? {}),
          ...(input.safeDetails ?? {}),
          retryOfWorkId: sourceAttempt.id,
          generatedAt: input.generatedAt,
          ...(sourceAttempt.dedupeKey ? { retryOfDedupeKey: sourceAttempt.dedupeKey } : {}),
        });
        const retryAttempt: ProcessAttemptRecord = {
          id: input.retryAttemptId,
          kind: sourceAttempt.kind,
          status: "pending",
          operationKey: sourceAttempt.operationKey,
          updatedAt: input.generatedAt,
          startedAt: input.generatedAt,
          nextActions: ["no-action"],
          phase: input.phase,
          step: input.step,
          retriable: false,
          ...(sourceAttempt.dedupeKey
            ? { dedupeKey: `${sourceAttempt.dedupeKey}:retry:${input.retryAttemptId}` }
            : {}),
          ...(sourceAttempt.correlationId ? { correlationId: sourceAttempt.correlationId } : {}),
          ...(sourceAttempt.requestId ? { requestId: sourceAttempt.requestId } : {}),
          ...(sourceAttempt.projectId ? { projectId: sourceAttempt.projectId } : {}),
          ...(sourceAttempt.resourceId ? { resourceId: sourceAttempt.resourceId } : {}),
          ...(sourceAttempt.deploymentId ? { deploymentId: sourceAttempt.deploymentId } : {}),
          ...(sourceAttempt.serverId ? { serverId: sourceAttempt.serverId } : {}),
          ...(sourceAttempt.domainBindingId
            ? { domainBindingId: sourceAttempt.domainBindingId }
            : {}),
          ...(sourceAttempt.certificateId ? { certificateId: sourceAttempt.certificateId } : {}),
          ...(Object.keys(safeDetails).length > 0 ? { safeDetails } : {}),
        };
        const retryValues = toInsertable(retryAttempt);

        const updatedSourceRow = await executor
          .updateTable("process_attempt_journal")
          .set({
            retriable: false,
            next_eligible_at: null,
            next_actions: ["no-action"],
            safe_details: sanitizeSafeDetails({
              ...(sourceAttempt.safeDetails ?? {}),
              retryGeneratedAt: input.generatedAt,
              retryAttemptId: input.retryAttemptId,
            }),
          })
          .where("id", "=", sourceAttempt.id)
          .where("status", "=", "retry-scheduled")
          .where("retriable", "=", true)
          .where("next_eligible_at", "<=", input.generatedAt)
          .returningAll()
          .executeTakeFirst();

        if (!updatedSourceRow) {
          const currentRow = await executor
            .selectFrom("process_attempt_journal")
            .selectAll()
            .where("id", "=", sourceAttempt.id)
            .executeTakeFirst();
          return currentRow
            ? ok({
                status: "not-retriable",
                sourceAttempt: rowToRecord(currentRow),
              })
            : ok({
                status: "not-found",
                sourceAttemptId: sourceAttempt.id,
              });
        }

        const retryRow = await executor
          .insertInto("process_attempt_journal")
          .values({
            ...retryValues,
            finished_at: null,
            error_code: null,
            error_category: null,
            retriable: false,
            next_eligible_at: null,
          })
          .returningAll()
          .executeTakeFirstOrThrow();

        return ok({
          status: "generated",
          sourceAttempt: rowToRecord(updatedSourceRow),
          retryAttempt: rowToRecord(retryRow),
        });
      });
    } catch (error) {
      return err(persistenceError("Process attempt retry generation could not be recorded", error));
    }
  }

  async listDueDeliveryCandidates(
    context: RepositoryContext,
    filter: ProcessAttemptDeliveryCandidateFilter,
  ): Promise<ProcessAttemptRecord[]> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("process-attempt", "list_due_delivery_candidates"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "process-attempt",
        },
      },
      async () => {
        let query = executor
          .selectFrom("process_attempt_journal")
          .selectAll()
          .where("status", "in", ["pending", "retry-scheduled"])
          .where((builder) =>
            builder.or([
              builder("next_eligible_at", "is", null),
              builder("next_eligible_at", "<=", filter.now),
            ]),
          )
          .orderBy("updated_at", "asc");

        if (filter.kind) {
          query = query.where("kind", "=", filter.kind);
        }

        if (filter.operationKey) {
          query = query.where("operation_key", "=", filter.operationKey);
        }

        const rows = await query.execute();
        return rows
          .map(rowToRecord)
          .filter((attempt) => attemptIsDueDeliveryCandidate(attempt, filter))
          .sort(dueDeliveryCandidateOrder)
          .slice(0, filter.limit ?? 50);
      },
    );
  }
}
