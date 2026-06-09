import {
  appaloftTraceAttributes,
  createReadModelSpanName,
  type DurableWorkQueueBackend,
  type DurableWorkRuntimeMode,
  type DurableWorkWorkerHeartbeatRecord,
  type DurableWorkWorkerHeartbeatStatus,
  type DurableWorkWorkerHeartbeatStore,
  type RepositoryContext,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { type Kysely, type Selectable } from "kysely";

import { type Database, type DurableWorkerHeartbeatsTable } from "../schema";
import { resolveRepositoryExecutor } from "./shared";

type DurableWorkerHeartbeatRow = Selectable<DurableWorkerHeartbeatsTable>;

function persistenceError(message: string, error: unknown) {
  return domainError.infra(message, {
    phase: "durable-worker-heartbeat",
    message: error instanceof Error ? error.message : String(error),
  });
}

function normalizeRuntimeMode(value: string): DurableWorkRuntimeMode {
  return value === "standalone" || value === "disabled" ? value : "embedded";
}

function normalizeQueueBackend(value: string): DurableWorkQueueBackend {
  return value === "external" ? "external" : "database";
}

function normalizeStatus(value: string): DurableWorkWorkerHeartbeatStatus {
  return value === "stopping" ? "stopping" : "online";
}

function rowToHeartbeat(row: DurableWorkerHeartbeatRow): DurableWorkWorkerHeartbeatRecord {
  return {
    workerId: row.worker_id,
    workerGroup: row.worker_group,
    slot: row.slot,
    mode: normalizeRuntimeMode(row.mode),
    queueBackend: normalizeQueueBackend(row.queue_backend),
    processStartedAt: row.process_started_at,
    lastSeenAt: row.last_seen_at,
    status: normalizeStatus(row.status),
  };
}

function validateHeartbeat(record: DurableWorkWorkerHeartbeatRecord): Result<void> {
  if (!record.workerId.trim()) {
    return err(
      domainError.validation("Durable worker heartbeat worker id is required", {
        phase: "durable-worker-heartbeat-validation",
        field: "workerId",
      }),
    );
  }

  if (!record.workerGroup.trim()) {
    return err(
      domainError.validation("Durable worker heartbeat worker group is required", {
        phase: "durable-worker-heartbeat-validation",
        field: "workerGroup",
      }),
    );
  }

  if (!Number.isInteger(record.slot) || record.slot < 1) {
    return err(
      domainError.validation("Durable worker heartbeat slot must be a positive integer", {
        phase: "durable-worker-heartbeat-validation",
        field: "slot",
      }),
    );
  }

  if (!Number.isFinite(Date.parse(record.processStartedAt))) {
    return err(
      domainError.validation("Durable worker heartbeat process start timestamp is invalid", {
        phase: "durable-worker-heartbeat-validation",
        field: "processStartedAt",
      }),
    );
  }

  if (!Number.isFinite(Date.parse(record.lastSeenAt))) {
    return err(
      domainError.validation("Durable worker heartbeat last seen timestamp is invalid", {
        phase: "durable-worker-heartbeat-validation",
        field: "lastSeenAt",
      }),
    );
  }

  return ok(undefined);
}

export class PgDurableWorkerHeartbeatStore implements DurableWorkWorkerHeartbeatStore {
  constructor(private readonly db: Kysely<Database>) {}

  async recordHeartbeat(
    context: RepositoryContext,
    record: DurableWorkWorkerHeartbeatRecord,
  ): Promise<Result<DurableWorkWorkerHeartbeatRecord>> {
    const validation = validateHeartbeat(record);
    if (validation.isErr()) {
      return err(validation.error);
    }

    const executor = resolveRepositoryExecutor(this.db, context);
    try {
      await context.tracer.startActiveSpan(
        createReadModelSpanName("durable-worker-heartbeat", "record"),
        {
          attributes: {
            [appaloftTraceAttributes.repositoryName]: "durable-worker-heartbeat",
            workerId: record.workerId,
            workerGroup: record.workerGroup,
          },
        },
        async () => {
          await executor
            .insertInto("durable_worker_heartbeats")
            .values({
              worker_id: record.workerId,
              worker_group: record.workerGroup,
              slot: record.slot,
              mode: record.mode,
              queue_backend: record.queueBackend,
              process_started_at: record.processStartedAt,
              last_seen_at: record.lastSeenAt,
              status: record.status,
            })
            .onConflict((conflict) =>
              conflict.column("worker_id").doUpdateSet({
                worker_group: record.workerGroup,
                slot: record.slot,
                mode: record.mode,
                queue_backend: record.queueBackend,
                process_started_at: record.processStartedAt,
                last_seen_at: record.lastSeenAt,
                status: record.status,
              }),
            )
            .execute();
        },
      );
      return ok(record);
    } catch (error) {
      return err(persistenceError("Failed to record durable worker heartbeat", error));
    }
  }

  async markStopped(
    context: RepositoryContext,
    input: Pick<DurableWorkWorkerHeartbeatRecord, "workerId" | "lastSeenAt">,
  ): Promise<Result<void>> {
    if (!input.workerId.trim()) {
      return err(
        domainError.validation("Durable worker heartbeat worker id is required", {
          phase: "durable-worker-heartbeat-validation",
          field: "workerId",
        }),
      );
    }

    const executor = resolveRepositoryExecutor(this.db, context);
    try {
      await context.tracer.startActiveSpan(
        createReadModelSpanName("durable-worker-heartbeat", "mark-stopped"),
        {
          attributes: {
            [appaloftTraceAttributes.repositoryName]: "durable-worker-heartbeat",
            workerId: input.workerId,
          },
        },
        async () => {
          await executor
            .updateTable("durable_worker_heartbeats")
            .set({
              last_seen_at: input.lastSeenAt,
              status: "stopping",
            })
            .where("worker_id", "=", input.workerId)
            .execute();
        },
      );
      return ok(undefined);
    } catch (error) {
      return err(persistenceError("Failed to mark durable worker heartbeat as stopped", error));
    }
  }

  async listHeartbeats(
    context: RepositoryContext,
    filter: { readonly workerGroup?: string; readonly limit?: number } = {},
  ): Promise<Result<DurableWorkWorkerHeartbeatRecord[]>> {
    const executor = resolveRepositoryExecutor(this.db, context);
    try {
      const rows = await context.tracer.startActiveSpan(
        createReadModelSpanName("durable-worker-heartbeat", "list"),
        {
          attributes: {
            [appaloftTraceAttributes.repositoryName]: "durable-worker-heartbeat",
            ...(filter.workerGroup ? { workerGroup: filter.workerGroup } : {}),
          },
        },
        async () => {
          let query = executor
            .selectFrom("durable_worker_heartbeats")
            .selectAll()
            .orderBy("last_seen_at", "desc")
            .orderBy("worker_id", "asc");

          if (filter.workerGroup) {
            query = query.where("worker_group", "=", filter.workerGroup);
          }

          if (filter.limit) {
            query = query.limit(filter.limit);
          }

          return query.execute();
        },
      );
      return ok(rows.map(rowToHeartbeat));
    } catch (error) {
      return err(persistenceError("Failed to list durable worker heartbeats", error));
    }
  }
}
