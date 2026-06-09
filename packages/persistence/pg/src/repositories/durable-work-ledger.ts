import {
  appaloftTraceAttributes,
  createReadModelSpanName,
  type DurableWorkClaimInput,
  type DurableWorkClaimResult,
  type DurableWorkCompletionInput,
  type DurableWorkCompletionResult,
  type DurableWorkDeliveryCandidateFilter,
  type DurableWorkEventKind,
  type DurableWorkEventRecord,
  type DurableWorkItemRecord,
  type DurableWorkItemStatus,
  type DurableWorkLedger,
  type DurableWorkListFilter,
  type DurableWorkQueueAdapter,
  type RepositoryContext,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { type Insertable, type Kysely, type Selectable, sql } from "kysely";

import { type Database, type DurableWorkEventsTable, type DurableWorkItemsTable } from "../schema";
import { resolveRepositoryExecutor } from "./shared";

type DurableWorkItemRow = Selectable<DurableWorkItemsTable>;
type DurableWorkEventRow = Selectable<DurableWorkEventsTable>;
type SafeValue = string | number | boolean | null;

const durableWorkItemStatuses: readonly DurableWorkItemStatus[] = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "canceled",
  "retry-scheduled",
  "dead-lettered",
];
const durableWorkEventKinds: readonly DurableWorkEventKind[] = [
  "accepted",
  "claimed",
  "progress",
  "retry-scheduled",
  "completed",
  "failed",
  "canceled",
  "dead-lettered",
];
const claimableStatuses: ReadonlySet<DurableWorkItemStatus> = new Set([
  "pending",
  "retry-scheduled",
]);
const terminalStatuses: ReadonlySet<DurableWorkItemStatus> = new Set([
  "succeeded",
  "failed",
  "canceled",
  "dead-lettered",
]);
const secretKeyPattern =
  /secret|password|passphrase|private[_-]?key|token|credential|command[_-]?line|commandline/i;
const secretValuePattern = /(BEGIN .*PRIVATE KEY|PRIVATE_KEY|SECRET_|PASSWORD=|TOKEN=|PASS=)/i;

function isDurableWorkItemStatus(value: string): value is DurableWorkItemStatus {
  return durableWorkItemStatuses.includes(value as DurableWorkItemStatus);
}

function isDurableWorkEventKind(value: string): value is DurableWorkEventKind {
  return durableWorkEventKinds.includes(value as DurableWorkEventKind);
}

function normalizeTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

function sanitizeSafeRecord(value?: Record<string, SafeValue>): Record<string, SafeValue> {
  if (!value) {
    return {};
  }

  const sanitized: Record<string, SafeValue> = {};
  for (const [key, recordValue] of Object.entries(value)) {
    if (secretKeyPattern.test(key)) {
      continue;
    }

    if (typeof recordValue === "string" && secretValuePattern.test(recordValue)) {
      continue;
    }

    sanitized[key] = recordValue;
  }

  return sanitized;
}

function safeRecordFromJson(value: unknown): Record<string, SafeValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const safe: Record<string, SafeValue> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (
      typeof rawValue === "string" ||
      typeof rawValue === "number" ||
      typeof rawValue === "boolean" ||
      rawValue === null
    ) {
      safe[key] = rawValue;
    }
  }

  return sanitizeSafeRecord(safe);
}

function persistenceError(message: string, error: unknown) {
  return domainError.infra(message, {
    phase: "durable-work-ledger",
    message: error instanceof Error ? error.message : String(error),
  });
}

function validateItem(item: DurableWorkItemRecord): Result<void> {
  if (!item.id.trim()) {
    return err(
      domainError.validation("Durable work item id is required", {
        phase: "durable-work-item-validation",
        field: "id",
      }),
    );
  }

  if (!item.operationKey.trim()) {
    return err(
      domainError.validation("Durable work operation key is required", {
        phase: "durable-work-item-validation",
        field: "operationKey",
      }),
    );
  }

  if (!Number.isInteger(item.priority)) {
    return err(
      domainError.validation("Durable work priority must be an integer", {
        phase: "durable-work-item-validation",
        field: "priority",
      }),
    );
  }

  if (!Number.isInteger(item.attemptCount) || item.attemptCount < 0) {
    return err(
      domainError.validation("Durable work attempt count must be a non-negative integer", {
        phase: "durable-work-item-validation",
        field: "attemptCount",
      }),
    );
  }

  if (!Number.isInteger(item.maxAttempts) || item.maxAttempts < 1) {
    return err(
      domainError.validation("Durable work max attempts must be a positive integer", {
        phase: "durable-work-item-validation",
        field: "maxAttempts",
      }),
    );
  }

  return ok(undefined);
}

function validateEvent(event: DurableWorkEventRecord): Result<void> {
  if (!event.id.trim()) {
    return err(
      domainError.validation("Durable work event id is required", {
        phase: "durable-work-event-validation",
        field: "id",
      }),
    );
  }

  if (!event.workItemId.trim()) {
    return err(
      domainError.validation("Durable work event item id is required", {
        phase: "durable-work-event-validation",
        field: "workItemId",
      }),
    );
  }

  if (!Number.isInteger(event.sequence) || event.sequence < 1) {
    return err(
      domainError.validation("Durable work event sequence must be a positive integer", {
        phase: "durable-work-event-validation",
        field: "sequence",
      }),
    );
  }

  return ok(undefined);
}

function rowToItem(row: DurableWorkItemRow): DurableWorkItemRecord {
  const status = isDurableWorkItemStatus(row.status) ? row.status : "pending";

  return {
    id: row.id,
    kind: row.kind,
    status,
    operationKey: row.operation_key,
    queueBackend: row.queue_backend === "external" ? "external" : "database",
    ...(row.dedupe_key ? { dedupeKey: row.dedupe_key } : {}),
    ...(row.correlation_id ? { correlationId: row.correlation_id } : {}),
    ...(row.request_id ? { requestId: row.request_id } : {}),
    ...(row.project_id ? { projectId: row.project_id } : {}),
    ...(row.environment_id ? { environmentId: row.environment_id } : {}),
    ...(row.resource_id ? { resourceId: row.resource_id } : {}),
    ...(row.deployment_id ? { deploymentId: row.deployment_id } : {}),
    ...(row.server_id ? { serverId: row.server_id } : {}),
    ...(row.subject_kind ? { subjectKind: row.subject_kind } : {}),
    ...(row.subject_id ? { subjectId: row.subject_id } : {}),
    ...(row.phase ? { phase: row.phase } : {}),
    ...(row.step ? { step: row.step } : {}),
    priority: row.priority,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    availableAt: normalizeTimestamp(row.available_at),
    ...(row.lease_owner ? { leaseOwner: row.lease_owner } : {}),
    ...(row.lease_expires_at ? { leaseExpiresAt: normalizeTimestamp(row.lease_expires_at) } : {}),
    ...(row.started_at ? { startedAt: normalizeTimestamp(row.started_at) } : {}),
    updatedAt: normalizeTimestamp(row.updated_at),
    ...(row.finished_at ? { finishedAt: normalizeTimestamp(row.finished_at) } : {}),
    ...(row.error_code ? { errorCode: row.error_code } : {}),
    ...(row.error_category ? { errorCategory: row.error_category } : {}),
    ...(row.retriable === null ? {} : { retriable: row.retriable }),
    ...(Object.keys(safeRecordFromJson(row.safe_input)).length > 0
      ? { safeInput: safeRecordFromJson(row.safe_input) }
      : {}),
    ...(Object.keys(safeRecordFromJson(row.safe_details)).length > 0
      ? { safeDetails: safeRecordFromJson(row.safe_details) }
      : {}),
  };
}

function rowToEvent(row: DurableWorkEventRow): DurableWorkEventRecord {
  const kind = isDurableWorkEventKind(row.kind) ? row.kind : "progress";
  const status = row.status && isDurableWorkItemStatus(row.status) ? row.status : undefined;

  return {
    id: row.id,
    workItemId: row.work_item_id,
    sequence: row.sequence,
    kind,
    ...(status ? { status } : {}),
    ...(row.phase ? { phase: row.phase } : {}),
    ...(row.step ? { step: row.step } : {}),
    ...(row.message ? { message: row.message } : {}),
    ...(row.worker_id ? { workerId: row.worker_id } : {}),
    ...(row.worker_group ? { workerGroup: row.worker_group } : {}),
    occurredAt: normalizeTimestamp(row.occurred_at),
    ...(Object.keys(safeRecordFromJson(row.safe_details)).length > 0
      ? { safeDetails: safeRecordFromJson(row.safe_details) }
      : {}),
  };
}

function toItemInsertable(item: DurableWorkItemRecord): Insertable<DurableWorkItemsTable> {
  return {
    id: item.id,
    kind: item.kind,
    status: item.status,
    operation_key: item.operationKey,
    queue_backend: item.queueBackend,
    dedupe_key: item.dedupeKey ?? null,
    correlation_id: item.correlationId ?? null,
    request_id: item.requestId ?? null,
    project_id: item.projectId ?? null,
    environment_id: item.environmentId ?? null,
    resource_id: item.resourceId ?? null,
    deployment_id: item.deploymentId ?? null,
    server_id: item.serverId ?? null,
    subject_kind: item.subjectKind ?? null,
    subject_id: item.subjectId ?? null,
    phase: item.phase ?? null,
    step: item.step ?? null,
    priority: item.priority,
    attempt_count: item.attemptCount,
    max_attempts: item.maxAttempts,
    available_at: item.availableAt,
    lease_owner: item.leaseOwner ?? null,
    lease_expires_at: item.leaseExpiresAt ?? null,
    started_at: item.startedAt ?? null,
    updated_at: item.updatedAt,
    finished_at: item.finishedAt ?? null,
    error_code: item.errorCode ?? null,
    error_category: item.errorCategory ?? null,
    retriable: item.retriable ?? null,
    safe_input: sanitizeSafeRecord(item.safeInput),
    safe_details: sanitizeSafeRecord(item.safeDetails),
  };
}

function toEventInsertable(event: DurableWorkEventRecord): Insertable<DurableWorkEventsTable> {
  return {
    id: event.id,
    work_item_id: event.workItemId,
    sequence: event.sequence,
    kind: event.kind,
    status: event.status ?? null,
    phase: event.phase ?? null,
    step: event.step ?? null,
    message: event.message ?? null,
    worker_id: event.workerId ?? null,
    worker_group: event.workerGroup ?? null,
    occurred_at: event.occurredAt,
    safe_details: sanitizeSafeRecord(event.safeDetails),
  };
}

function isDue(item: DurableWorkItemRecord, now: string): boolean {
  return item.availableAt.localeCompare(now) <= 0;
}

function hasHeldLease(item: DurableWorkItemRecord, now: string): boolean {
  return Boolean(
    item.leaseOwner && item.leaseExpiresAt && item.leaseExpiresAt.localeCompare(now) > 0,
  );
}

function refusedClaimResult(item: DurableWorkItemRecord, now: string): DurableWorkClaimResult {
  if (!claimableStatuses.has(item.status)) {
    return {
      status: "refused",
      reason: "not-claimable",
      workItem: item,
    };
  }

  if (!isDue(item, now)) {
    return {
      status: "refused",
      reason: "not-due",
      workItem: item,
    };
  }

  return {
    status: "refused",
    reason: hasHeldLease(item, now) ? "lease-held" : "not-claimable",
    workItem: item,
  };
}

export class PgDurableWorkLedger implements DurableWorkLedger, DurableWorkQueueAdapter {
  constructor(private readonly db: Kysely<Database>) {}

  async recordItem(
    context: RepositoryContext,
    item: DurableWorkItemRecord,
  ): Promise<Result<DurableWorkItemRecord>> {
    const validated = validateItem(item);
    if (validated.isErr()) {
      return err(validated.error);
    }

    const executor = resolveRepositoryExecutor(this.db, context);
    try {
      const row = await executor
        .insertInto("durable_work_items")
        .values(toItemInsertable(item))
        .onConflict((conflict) =>
          conflict.column("id").doUpdateSet({
            kind: item.kind,
            status: item.status,
            operation_key: item.operationKey,
            queue_backend: item.queueBackend,
            dedupe_key: item.dedupeKey ?? null,
            correlation_id: item.correlationId ?? null,
            request_id: item.requestId ?? null,
            project_id: item.projectId ?? null,
            environment_id: item.environmentId ?? null,
            resource_id: item.resourceId ?? null,
            deployment_id: item.deploymentId ?? null,
            server_id: item.serverId ?? null,
            subject_kind: item.subjectKind ?? null,
            subject_id: item.subjectId ?? null,
            phase: item.phase ?? null,
            step: item.step ?? null,
            priority: item.priority,
            attempt_count: item.attemptCount,
            max_attempts: item.maxAttempts,
            available_at: item.availableAt,
            lease_owner: item.leaseOwner ?? null,
            lease_expires_at: item.leaseExpiresAt ?? null,
            started_at: item.startedAt ?? null,
            updated_at: item.updatedAt,
            finished_at: item.finishedAt ?? null,
            error_code: item.errorCode ?? null,
            error_category: item.errorCategory ?? null,
            retriable: item.retriable ?? null,
            safe_input: sanitizeSafeRecord(item.safeInput),
            safe_details: sanitizeSafeRecord(item.safeDetails),
          }),
        )
        .returningAll()
        .executeTakeFirstOrThrow();

      return ok(rowToItem(row));
    } catch (error) {
      return err(persistenceError("Durable work item could not be recorded", error));
    }
  }

  async appendEvent(
    context: RepositoryContext,
    event: DurableWorkEventRecord,
  ): Promise<Result<DurableWorkEventRecord>> {
    const validated = validateEvent(event);
    if (validated.isErr()) {
      return err(validated.error);
    }

    const executor = resolveRepositoryExecutor(this.db, context);
    try {
      const row = await executor
        .insertInto("durable_work_events")
        .values(toEventInsertable(event))
        .returningAll()
        .executeTakeFirstOrThrow();

      return ok(rowToEvent(row));
    } catch (error) {
      return err(persistenceError("Durable work event could not be appended", error));
    }
  }

  async findItem(
    context: RepositoryContext,
    id: string,
  ): Promise<Result<DurableWorkItemRecord | null>> {
    const executor = resolveRepositoryExecutor(this.db, context);
    try {
      const row = await executor
        .selectFrom("durable_work_items")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();

      return ok(row ? rowToItem(row) : null);
    } catch (error) {
      return err(persistenceError("Durable work item could not be read", error));
    }
  }

  async listItems(
    context: RepositoryContext,
    filter: DurableWorkListFilter = {},
  ): Promise<Result<DurableWorkItemRecord[]>> {
    const executor = resolveRepositoryExecutor(this.db, context);
    try {
      return ok(
        await context.tracer.startActiveSpan(
          createReadModelSpanName("durable-work", "list"),
          {
            attributes: {
              [appaloftTraceAttributes.readModelName]: "durable-work",
            },
          },
          async () => {
            let query = executor
              .selectFrom("durable_work_items")
              .selectAll()
              .orderBy("updated_at", "desc")
              .limit(filter.limit ?? 50);

            if (filter.kind) query = query.where("kind", "=", filter.kind);
            if (filter.status) query = query.where("status", "=", filter.status);
            if (filter.operationKey) {
              query = query.where("operation_key", "=", filter.operationKey);
            }
            if (filter.projectId) query = query.where("project_id", "=", filter.projectId);
            if (filter.resourceId) query = query.where("resource_id", "=", filter.resourceId);
            if (filter.deploymentId) {
              query = query.where("deployment_id", "=", filter.deploymentId);
            }
            if (filter.serverId) query = query.where("server_id", "=", filter.serverId);
            if (filter.subjectKind) query = query.where("subject_kind", "=", filter.subjectKind);
            if (filter.subjectId) query = query.where("subject_id", "=", filter.subjectId);

            return (await query.execute()).map(rowToItem);
          },
        ),
      );
    } catch (error) {
      return err(persistenceError("Durable work items could not be listed", error));
    }
  }

  async listEvents(
    context: RepositoryContext,
    workItemId: string,
  ): Promise<Result<DurableWorkEventRecord[]>> {
    const executor = resolveRepositoryExecutor(this.db, context);
    try {
      const rows = await executor
        .selectFrom("durable_work_events")
        .selectAll()
        .where("work_item_id", "=", workItemId)
        .orderBy("sequence", "asc")
        .execute();

      return ok(rows.map(rowToEvent));
    } catch (error) {
      return err(persistenceError("Durable work events could not be listed", error));
    }
  }

  async listDueCandidates(
    context: RepositoryContext,
    filter: DurableWorkDeliveryCandidateFilter,
  ): Promise<Result<DurableWorkItemRecord[]>> {
    const executor = resolveRepositoryExecutor(this.db, context);
    try {
      return ok(
        await context.tracer.startActiveSpan(
          createReadModelSpanName("durable-work", "list_due_candidates"),
          {
            attributes: {
              [appaloftTraceAttributes.readModelName]: "durable-work",
            },
          },
          async () => {
            let query = executor
              .selectFrom("durable_work_items")
              .selectAll()
              .where("status", "in", ["pending", "retry-scheduled"])
              .where("available_at", "<=", filter.now)
              .where((builder) =>
                builder.or([
                  builder("lease_owner", "is", null),
                  builder("lease_expires_at", "is", null),
                  builder("lease_expires_at", "<=", filter.now),
                ]),
              )
              .orderBy("priority", "desc")
              .orderBy("available_at", "asc")
              .orderBy("updated_at", "asc")
              .limit(filter.limit ?? 50);

            if (filter.kind) query = query.where("kind", "=", filter.kind);
            if (filter.operationKey) {
              query = query.where("operation_key", "=", filter.operationKey);
            }

            return (await query.execute()).map(rowToItem);
          },
        ),
      );
    } catch (error) {
      return err(persistenceError("Durable work candidates could not be listed", error));
    }
  }

  async claimDue(
    context: RepositoryContext,
    input: DurableWorkClaimInput,
  ): Promise<Result<DurableWorkClaimResult>> {
    if (!input.workItemId.trim()) {
      return err(
        domainError.validation("Durable work item id is required", {
          phase: "durable-work-claim",
          field: "workItemId",
        }),
      );
    }

    if (!input.workerId.trim()) {
      return err(
        domainError.validation("Durable work worker id is required", {
          phase: "durable-work-claim",
          field: "workerId",
        }),
      );
    }

    const executor = resolveRepositoryExecutor(this.db, context);
    try {
      const existingRow = await executor
        .selectFrom("durable_work_items")
        .selectAll()
        .where("id", "=", input.workItemId)
        .executeTakeFirst();

      if (!existingRow) {
        return ok({
          status: "not-found",
          workItemId: input.workItemId,
        });
      }

      const existing = rowToItem(existingRow);
      if (
        !claimableStatuses.has(existing.status) ||
        !isDue(existing, input.claimedAt) ||
        hasHeldLease(existing, input.claimedAt)
      ) {
        return ok(refusedClaimResult(existing, input.claimedAt));
      }

      const safeDetails = sanitizeSafeRecord({
        ...(existing.safeDetails ?? {}),
        ...(input.safeDetails ?? {}),
        claimedAt: input.claimedAt,
        claimedBy: input.workerId,
      });
      const row = await executor
        .updateTable("durable_work_items")
        .set({
          status: "running",
          phase: "worker-claim",
          step: "claimed",
          attempt_count: sql<number>`attempt_count + 1`,
          lease_owner: input.workerId,
          lease_expires_at: input.leaseExpiresAt,
          started_at: existing.startedAt ?? input.claimedAt,
          updated_at: input.claimedAt,
          retriable: false,
          safe_details: safeDetails,
        })
        .where("id", "=", input.workItemId)
        .where("status", "in", ["pending", "retry-scheduled"])
        .where("available_at", "<=", input.claimedAt)
        .where((builder) =>
          builder.or([
            builder("lease_owner", "is", null),
            builder("lease_expires_at", "is", null),
            builder("lease_expires_at", "<=", input.claimedAt),
          ]),
        )
        .returningAll()
        .executeTakeFirst();

      if (row) {
        return ok({
          status: "claimed",
          workItem: rowToItem(row),
        });
      }

      const current = await this.findItem(context, input.workItemId);
      if (current.isErr()) {
        return err(current.error);
      }

      return current.value
        ? ok(refusedClaimResult(current.value, input.claimedAt))
        : ok({
            status: "not-found",
            workItemId: input.workItemId,
          });
    } catch (error) {
      return err(persistenceError("Durable work item could not be claimed", error));
    }
  }

  async complete(
    context: RepositoryContext,
    input: DurableWorkCompletionInput,
  ): Promise<Result<DurableWorkCompletionResult>> {
    if (!input.workItemId.trim()) {
      return err(
        domainError.validation("Durable work item id is required", {
          phase: "durable-work-completion",
          field: "workItemId",
        }),
      );
    }

    if (input.status === "retry-scheduled" && !input.nextAvailableAt) {
      return err(
        domainError.validation("Retry-scheduled durable work requires next availability", {
          phase: "durable-work-completion",
          field: "nextAvailableAt",
        }),
      );
    }

    const executor = resolveRepositoryExecutor(this.db, context);
    try {
      const existingRow = await executor
        .selectFrom("durable_work_items")
        .selectAll()
        .where("id", "=", input.workItemId)
        .executeTakeFirst();

      if (!existingRow) {
        return ok({
          status: "not-found",
          workItemId: input.workItemId,
        });
      }

      const existing = rowToItem(existingRow);
      if (existing.status !== "running") {
        return ok({
          status: "not-running",
          workItem: existing,
        });
      }

      const safeDetails = sanitizeSafeRecord({
        ...(existing.safeDetails ?? {}),
        ...(input.safeDetails ?? {}),
      });
      const row = await executor
        .updateTable("durable_work_items")
        .set({
          status: input.status,
          phase: input.phase ?? existing.phase ?? null,
          step: input.step ?? existing.step ?? null,
          lease_owner: null,
          lease_expires_at: null,
          available_at:
            input.status === "retry-scheduled" ? input.nextAvailableAt : input.completedAt,
          updated_at: input.completedAt,
          finished_at: terminalStatuses.has(input.status) ? input.completedAt : null,
          error_code: input.errorCode ?? null,
          error_category: input.errorCategory ?? null,
          retriable: input.retriable ?? input.status === "retry-scheduled",
          safe_details: safeDetails,
        })
        .where("id", "=", input.workItemId)
        .where("status", "=", "running")
        .returningAll()
        .executeTakeFirst();

      if (row) {
        return ok({
          status: "completed",
          workItem: rowToItem(row),
        });
      }

      const current = await this.findItem(context, input.workItemId);
      if (current.isErr()) {
        return err(current.error);
      }

      return current.value
        ? ok({
            status: "not-running",
            workItem: current.value,
          })
        : ok({
            status: "not-found",
            workItemId: input.workItemId,
          });
    } catch (error) {
      return err(persistenceError("Durable work item could not be completed", error));
    }
  }
}
