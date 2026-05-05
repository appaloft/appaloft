import {
  appaloftTraceAttributes,
  createReadModelSpanName,
  createRepositorySpanName,
  type ListScheduledTasksResult,
  type RepositoryContext,
  type ScheduledTaskDefinitionRepository,
  type ScheduledTaskDefinitionSummary,
  type ScheduledTaskReadModel,
  type ScheduledTaskRunAttemptRepository,
  type ScheduledTaskRunLogEntry,
  type ScheduledTaskRunLogReadModel,
  type ScheduledTaskRunLogRecord,
  type ScheduledTaskRunLogRecorder,
  type ScheduledTaskRunLogsResult,
  type ScheduledTaskRunReadModel,
  type ScheduledTaskRunSummary,
} from "@appaloft/application";
import {
  CreatedAt,
  type DeleteScheduledTaskDefinitionSpec,
  FinishedAt,
  ok,
  ResourceId,
  ScheduledTaskCommandIntent,
  ScheduledTaskConcurrencyPolicyValue,
  ScheduledTaskDefinition,
  type ScheduledTaskDefinitionByIdSpec,
  type ScheduledTaskDefinitionMutationSpec,
  type ScheduledTaskDefinitionMutationSpecVisitor,
  type ScheduledTaskDefinitionSelectionSpec,
  type ScheduledTaskDefinitionSelectionSpecVisitor,
  ScheduledTaskDefinitionStatusValue,
  ScheduledTaskId,
  ScheduledTaskRetryLimit,
  ScheduledTaskRunAttempt,
  type ScheduledTaskRunAttemptByIdSpec,
  type ScheduledTaskRunAttemptMutationSpec,
  type ScheduledTaskRunAttemptMutationSpecVisitor,
  type ScheduledTaskRunAttemptSelectionSpec,
  type ScheduledTaskRunAttemptSelectionSpecVisitor,
  ScheduledTaskRunExitCode,
  ScheduledTaskRunFailureSummary,
  ScheduledTaskRunId,
  ScheduledTaskRunSkippedReasonValue,
  ScheduledTaskRunStatusValue,
  ScheduledTaskRunTriggerKindValue,
  ScheduledTaskScheduleExpression,
  ScheduledTaskTimeoutSeconds,
  ScheduledTaskTimezone,
  StartedAt,
  type UpsertScheduledTaskDefinitionSpec,
  type UpsertScheduledTaskRunAttemptSpec,
} from "@appaloft/core";
import { type Insertable, type Kysely, type Selectable, type SelectQueryBuilder } from "kysely";

import { type Database } from "../schema";
import { normalizeTimestamp, resolveRepositoryExecutor, withRepositoryTransaction } from "./shared";

type ScheduledTaskDefinitionRow = Selectable<Database["scheduled_task_definitions"]>;
type ScheduledTaskRunAttemptRow = Selectable<Database["scheduled_task_run_attempts"]>;
type ScheduledTaskRunLogRow = Selectable<Database["scheduled_task_run_logs"]>;
type ScheduledTaskDefinitionSelectionQuery = SelectQueryBuilder<
  Database,
  "scheduled_task_definitions",
  ScheduledTaskDefinitionRow
>;
type ScheduledTaskDefinitionSelectionApplier = (
  query: ScheduledTaskDefinitionSelectionQuery,
) => ScheduledTaskDefinitionSelectionQuery;
type ScheduledTaskRunAttemptSelectionQuery = SelectQueryBuilder<
  Database,
  "scheduled_task_run_attempts",
  ScheduledTaskRunAttemptRow
>;
type ScheduledTaskRunAttemptSelectionApplier = (
  query: ScheduledTaskRunAttemptSelectionQuery,
) => ScheduledTaskRunAttemptSelectionQuery;
type ScheduledTaskDefinitionMutation =
  | {
      kind: "upsert";
      scheduledTaskDefinition: Insertable<Database["scheduled_task_definitions"]>;
    }
  | {
      kind: "delete";
      taskId: string;
      resourceId: string;
    };
type ScheduledTaskRunAttemptMutation = {
  scheduledTaskRunAttempt: Insertable<Database["scheduled_task_run_attempts"]>;
};

class KyselyScheduledTaskDefinitionSelectionVisitor
  implements ScheduledTaskDefinitionSelectionSpecVisitor<ScheduledTaskDefinitionSelectionApplier>
{
  visitScheduledTaskDefinitionById(
    spec: ScheduledTaskDefinitionByIdSpec,
  ): ScheduledTaskDefinitionSelectionApplier {
    return (query) => {
      let next = query.where("id", "=", spec.taskId.value);
      if (spec.resourceId) {
        next = next.where("resource_id", "=", spec.resourceId.value);
      }
      return next;
    };
  }
}

class KyselyScheduledTaskDefinitionMutationVisitor
  implements ScheduledTaskDefinitionMutationSpecVisitor<ScheduledTaskDefinitionMutation>
{
  visitUpsertScheduledTaskDefinition(
    spec: UpsertScheduledTaskDefinitionSpec,
  ): ScheduledTaskDefinitionMutation {
    const state = spec.state;
    return {
      kind: "upsert",
      scheduledTaskDefinition: {
        id: state.id.value,
        resource_id: state.resourceId.value,
        schedule: state.schedule.value,
        timezone: state.timezone.value,
        command_intent: state.commandIntent.value,
        timeout_seconds: state.timeoutSeconds.value,
        retry_limit: state.retryLimit.value,
        concurrency_policy: state.concurrencyPolicy.value,
        status: state.status.value,
        created_at: state.createdAt.value,
      },
    };
  }

  visitDeleteScheduledTaskDefinition(
    spec: DeleteScheduledTaskDefinitionSpec,
  ): ScheduledTaskDefinitionMutation {
    return {
      kind: "delete",
      taskId: spec.taskId.value,
      resourceId: spec.resourceId.value,
    };
  }
}

class KyselyScheduledTaskRunAttemptSelectionVisitor
  implements ScheduledTaskRunAttemptSelectionSpecVisitor<ScheduledTaskRunAttemptSelectionApplier>
{
  visitScheduledTaskRunAttemptById(
    spec: ScheduledTaskRunAttemptByIdSpec,
  ): ScheduledTaskRunAttemptSelectionApplier {
    return (query) => {
      let next = query.where("id", "=", spec.runId.value);
      if (spec.taskId) {
        next = next.where("task_id", "=", spec.taskId.value);
      }
      if (spec.resourceId) {
        next = next.where("resource_id", "=", spec.resourceId.value);
      }
      return next;
    };
  }
}

class KyselyScheduledTaskRunAttemptMutationVisitor
  implements ScheduledTaskRunAttemptMutationSpecVisitor<ScheduledTaskRunAttemptMutation>
{
  visitUpsertScheduledTaskRunAttempt(
    spec: UpsertScheduledTaskRunAttemptSpec,
  ): ScheduledTaskRunAttemptMutation {
    const state = spec.state;
    return {
      scheduledTaskRunAttempt: {
        id: state.id.value,
        task_id: state.taskId.value,
        resource_id: state.resourceId.value,
        trigger_kind: state.triggerKind.value,
        status: state.status.value,
        created_at: state.createdAt.value,
        started_at: state.startedAt?.value ?? null,
        finished_at: state.finishedAt?.value ?? null,
        exit_code: state.exitCode?.value ?? null,
        failure_summary: state.failureSummary?.value ?? null,
        skipped_reason: state.skippedReason?.value ?? null,
      },
    };
  }
}

function rehydrateScheduledTaskDefinition(
  row: ScheduledTaskDefinitionRow,
): ScheduledTaskDefinition {
  return ScheduledTaskDefinition.rehydrate({
    id: ScheduledTaskId.rehydrate(row.id),
    resourceId: ResourceId.rehydrate(row.resource_id),
    schedule: ScheduledTaskScheduleExpression.rehydrate(row.schedule),
    timezone: ScheduledTaskTimezone.rehydrate(row.timezone),
    commandIntent: ScheduledTaskCommandIntent.rehydrate(row.command_intent),
    timeoutSeconds: ScheduledTaskTimeoutSeconds.rehydrate(row.timeout_seconds),
    retryLimit: ScheduledTaskRetryLimit.rehydrate(row.retry_limit),
    concurrencyPolicy: ScheduledTaskConcurrencyPolicyValue.rehydrate(
      row.concurrency_policy as Parameters<typeof ScheduledTaskConcurrencyPolicyValue.rehydrate>[0],
    ),
    status: ScheduledTaskDefinitionStatusValue.rehydrate(
      row.status as Parameters<typeof ScheduledTaskDefinitionStatusValue.rehydrate>[0],
    ),
    createdAt: CreatedAt.rehydrate(normalizeTimestamp(row.created_at) ?? row.created_at),
  });
}

function toScheduledTaskRunSummary(row: ScheduledTaskRunAttemptRow): ScheduledTaskRunSummary {
  return {
    runId: row.id,
    taskId: row.task_id,
    resourceId: row.resource_id,
    triggerKind: row.trigger_kind as ScheduledTaskRunSummary["triggerKind"],
    status: row.status as ScheduledTaskRunSummary["status"],
    createdAt: normalizeTimestamp(row.created_at) ?? row.created_at,
    ...(row.started_at ? { startedAt: normalizeTimestamp(row.started_at) ?? row.started_at } : {}),
    ...(row.finished_at
      ? { finishedAt: normalizeTimestamp(row.finished_at) ?? row.finished_at }
      : {}),
    ...(row.exit_code !== null ? { exitCode: row.exit_code } : {}),
    ...(row.failure_summary ? { failureSummary: row.failure_summary } : {}),
    ...(row.skipped_reason
      ? {
          skippedReason: row.skipped_reason as NonNullable<
            ScheduledTaskRunSummary["skippedReason"]
          >,
        }
      : {}),
  };
}

function rehydrateScheduledTaskRunAttempt(
  row: ScheduledTaskRunAttemptRow,
): ScheduledTaskRunAttempt {
  return ScheduledTaskRunAttempt.rehydrate({
    id: ScheduledTaskRunId.rehydrate(row.id),
    taskId: ScheduledTaskId.rehydrate(row.task_id),
    resourceId: ResourceId.rehydrate(row.resource_id),
    triggerKind: ScheduledTaskRunTriggerKindValue.rehydrate(
      row.trigger_kind as Parameters<typeof ScheduledTaskRunTriggerKindValue.rehydrate>[0],
    ),
    status: ScheduledTaskRunStatusValue.rehydrate(
      row.status as Parameters<typeof ScheduledTaskRunStatusValue.rehydrate>[0],
    ),
    createdAt: CreatedAt.rehydrate(normalizeTimestamp(row.created_at) ?? row.created_at),
    ...(row.started_at
      ? { startedAt: StartedAt.rehydrate(normalizeTimestamp(row.started_at) ?? row.started_at) }
      : {}),
    ...(row.finished_at
      ? {
          finishedAt: FinishedAt.rehydrate(normalizeTimestamp(row.finished_at) ?? row.finished_at),
        }
      : {}),
    ...(row.exit_code !== null
      ? { exitCode: ScheduledTaskRunExitCode.rehydrate(row.exit_code) }
      : {}),
    ...(row.failure_summary
      ? { failureSummary: ScheduledTaskRunFailureSummary.rehydrate(row.failure_summary) }
      : {}),
    ...(row.skipped_reason
      ? {
          skippedReason: ScheduledTaskRunSkippedReasonValue.rehydrate(
            row.skipped_reason as Parameters<
              typeof ScheduledTaskRunSkippedReasonValue.rehydrate
            >[0],
          ),
        }
      : {}),
  });
}

const logSecretPattern = /(BEGIN .*PRIVATE KEY|PRIVATE_KEY|SECRET_|PASSWORD=|TOKEN=|PASS=)/i;

function safeLogMessage(message: string): string {
  return logSecretPattern.test(message) ? "********" : message;
}

function toScheduledTaskRunLogEntry(row: ScheduledTaskRunLogRow): ScheduledTaskRunLogEntry {
  return {
    timestamp: normalizeTimestamp(row.logged_at) ?? row.logged_at,
    stream: row.stream as ScheduledTaskRunLogEntry["stream"],
    message: safeLogMessage(row.message),
  };
}

function toScheduledTaskDefinitionSummary(
  row: ScheduledTaskDefinitionRow,
  latestRun?: ScheduledTaskRunSummary,
): ScheduledTaskDefinitionSummary {
  return {
    taskId: row.id,
    resourceId: row.resource_id,
    schedule: row.schedule,
    timezone: row.timezone,
    commandIntent: row.command_intent,
    timeoutSeconds: row.timeout_seconds,
    retryLimit: row.retry_limit,
    concurrencyPolicy:
      row.concurrency_policy as ScheduledTaskDefinitionSummary["concurrencyPolicy"],
    status: row.status as ScheduledTaskDefinitionSummary["status"],
    createdAt: normalizeTimestamp(row.created_at) ?? row.created_at,
    ...(latestRun ? { latestRun } : {}),
  };
}

async function loadLatestRuns(
  executor: ReturnType<typeof resolveRepositoryExecutor>,
  taskIds: string[],
): Promise<Map<string, ScheduledTaskRunSummary>> {
  const latestRuns = new Map<string, ScheduledTaskRunSummary>();
  if (taskIds.length === 0) {
    return latestRuns;
  }

  const rows = await executor
    .selectFrom("scheduled_task_run_attempts")
    .selectAll()
    .where("task_id", "in", taskIds)
    .orderBy("task_id", "asc")
    .orderBy("created_at", "desc")
    .orderBy("id", "desc")
    .execute();

  for (const row of rows) {
    if (!latestRuns.has(row.task_id)) {
      latestRuns.set(row.task_id, toScheduledTaskRunSummary(row));
    }
  }

  return latestRuns;
}

export class PgScheduledTaskDefinitionRepository implements ScheduledTaskDefinitionRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async findOne(
    context: RepositoryContext,
    spec: ScheduledTaskDefinitionSelectionSpec,
  ): Promise<ScheduledTaskDefinition | null> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createRepositorySpanName("scheduled-task-definition", "find_one"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "scheduled-task-definition",
          [appaloftTraceAttributes.selectionSpecName]: spec.constructor.name,
        },
      },
      async () => {
        const applySelection = spec.accept(new KyselyScheduledTaskDefinitionSelectionVisitor());
        const row = await applySelection(
          executor.selectFrom("scheduled_task_definitions").selectAll(),
        ).executeTakeFirst();

        return row ? rehydrateScheduledTaskDefinition(row) : null;
      },
    );
  }

  async upsert(
    context: RepositoryContext,
    task: ScheduledTaskDefinition,
    spec: ScheduledTaskDefinitionMutationSpec,
  ): Promise<void> {
    void task;
    const mutation = spec.accept(new KyselyScheduledTaskDefinitionMutationVisitor());
    if (mutation.kind !== "upsert") {
      return;
    }

    await context.tracer.startActiveSpan(
      createRepositorySpanName("scheduled-task-definition", "upsert"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "scheduled-task-definition",
          [appaloftTraceAttributes.mutationSpecName]: spec.constructor.name,
        },
      },
      async () => {
        await withRepositoryTransaction(this.db, context, async (transaction) => {
          await transaction
            .insertInto("scheduled_task_definitions")
            .values(mutation.scheduledTaskDefinition)
            .onConflict((conflict) =>
              conflict.column("id").doUpdateSet({
                schedule: mutation.scheduledTaskDefinition.schedule,
                timezone: mutation.scheduledTaskDefinition.timezone,
                command_intent: mutation.scheduledTaskDefinition.command_intent,
                timeout_seconds: mutation.scheduledTaskDefinition.timeout_seconds,
                retry_limit: mutation.scheduledTaskDefinition.retry_limit,
                concurrency_policy: mutation.scheduledTaskDefinition.concurrency_policy,
                status: mutation.scheduledTaskDefinition.status,
              }),
            )
            .execute();
        });
      },
    );
  }

  async delete(
    context: RepositoryContext,
    spec: ScheduledTaskDefinitionMutationSpec,
  ): Promise<void> {
    const mutation = spec.accept(new KyselyScheduledTaskDefinitionMutationVisitor());
    if (mutation.kind !== "delete") {
      return;
    }

    await context.tracer.startActiveSpan(
      createRepositorySpanName("scheduled-task-definition", "delete"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "scheduled-task-definition",
          [appaloftTraceAttributes.mutationSpecName]: spec.constructor.name,
        },
      },
      async () => {
        await withRepositoryTransaction(this.db, context, async (transaction) => {
          await transaction
            .deleteFrom("scheduled_task_definitions")
            .where("id", "=", mutation.taskId)
            .where("resource_id", "=", mutation.resourceId)
            .execute();
        });
      },
    );
  }
}

export class PgScheduledTaskRunAttemptRepository implements ScheduledTaskRunAttemptRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async findOne(
    context: RepositoryContext,
    spec: ScheduledTaskRunAttemptSelectionSpec,
  ): Promise<ScheduledTaskRunAttempt | null> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createRepositorySpanName("scheduled-task-run-attempt", "find_one"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "scheduled-task-run-attempt",
          [appaloftTraceAttributes.selectionSpecName]: spec.constructor.name,
        },
      },
      async () => {
        const applySelection = spec.accept(new KyselyScheduledTaskRunAttemptSelectionVisitor());
        const row = await applySelection(
          executor.selectFrom("scheduled_task_run_attempts").selectAll(),
        ).executeTakeFirst();

        return row ? rehydrateScheduledTaskRunAttempt(row) : null;
      },
    );
  }

  async upsert(
    context: RepositoryContext,
    runAttempt: ScheduledTaskRunAttempt,
    spec: ScheduledTaskRunAttemptMutationSpec,
  ): Promise<void> {
    void runAttempt;
    const mutation = spec.accept(new KyselyScheduledTaskRunAttemptMutationVisitor());

    await context.tracer.startActiveSpan(
      createRepositorySpanName("scheduled-task-run-attempt", "upsert"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "scheduled-task-run-attempt",
          [appaloftTraceAttributes.mutationSpecName]: spec.constructor.name,
        },
      },
      async () => {
        await withRepositoryTransaction(this.db, context, async (transaction) => {
          await transaction
            .insertInto("scheduled_task_run_attempts")
            .values(mutation.scheduledTaskRunAttempt)
            .onConflict((conflict) =>
              conflict.column("id").doUpdateSet({
                trigger_kind: mutation.scheduledTaskRunAttempt.trigger_kind,
                status: mutation.scheduledTaskRunAttempt.status,
                started_at: mutation.scheduledTaskRunAttempt.started_at,
                finished_at: mutation.scheduledTaskRunAttempt.finished_at,
                exit_code: mutation.scheduledTaskRunAttempt.exit_code,
                failure_summary: mutation.scheduledTaskRunAttempt.failure_summary,
                skipped_reason: mutation.scheduledTaskRunAttempt.skipped_reason,
              }),
            )
            .execute();
        });
      },
    );
  }
}

export class PgScheduledTaskRunLogRecorder implements ScheduledTaskRunLogRecorder {
  constructor(private readonly db: Kysely<Database>) {}

  async recordMany(
    context: RepositoryContext,
    records: ScheduledTaskRunLogRecord[],
  ): Promise<Awaited<ReturnType<ScheduledTaskRunLogRecorder["recordMany"]>>> {
    if (records.length === 0) {
      return ok({ recorded: 0 });
    }

    const executor = resolveRepositoryExecutor(this.db, context);
    await context.tracer.startActiveSpan(
      createRepositorySpanName("scheduled-task-run-log", "record_many"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "scheduled-task-run-log",
        },
      },
      async () => {
        await executor
          .insertInto("scheduled_task_run_logs")
          .values(
            records.map((record) => ({
              id: record.id,
              run_id: record.runId,
              task_id: record.taskId,
              resource_id: record.resourceId,
              logged_at: record.timestamp,
              stream: record.stream,
              message: safeLogMessage(record.message),
            })),
          )
          .onConflict((conflict) => conflict.column("id").doNothing())
          .execute();
      },
    );

    return ok({ recorded: records.length });
  }
}

export class PgScheduledTaskReadModel implements ScheduledTaskReadModel {
  constructor(private readonly db: Kysely<Database>) {}

  async list(
    context: RepositoryContext,
    input: Parameters<ScheduledTaskReadModel["list"]>[1],
  ): Promise<Omit<ListScheduledTasksResult, "schemaVersion" | "generatedAt">> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("scheduled-task", "list"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "scheduled-task",
        },
      },
      async () => {
        const limit = input.limit ?? 50;
        let query = executor
          .selectFrom("scheduled_task_definitions")
          .innerJoin("resources", "resources.id", "scheduled_task_definitions.resource_id")
          .selectAll("scheduled_task_definitions")
          .limit(limit + 1);

        if (input.projectId) {
          query = query.where("resources.project_id", "=", input.projectId);
        }
        if (input.environmentId) {
          query = query.where("resources.environment_id", "=", input.environmentId);
        }
        if (input.resourceId) {
          query = query.where("scheduled_task_definitions.resource_id", "=", input.resourceId);
        }
        if (input.status) {
          query = query.where("scheduled_task_definitions.status", "=", input.status);
        }
        if (input.cursor) {
          query = query.where("scheduled_task_definitions.created_at", "<", input.cursor);
        }

        const rows = await query
          .orderBy("scheduled_task_definitions.created_at", "desc")
          .orderBy("scheduled_task_definitions.id", "desc")
          .execute();
        const pageRows = rows.slice(0, limit);
        const nextCursor = rows.length > limit ? pageRows.at(-1)?.created_at : undefined;
        const latestRuns = await loadLatestRuns(
          executor,
          pageRows.map((row) => row.id),
        );

        return {
          items: pageRows.map((row) =>
            toScheduledTaskDefinitionSummary(row, latestRuns.get(row.id)),
          ),
          ...(nextCursor ? { nextCursor: normalizeTimestamp(nextCursor) ?? nextCursor } : {}),
        };
      },
    );
  }

  async show(
    context: RepositoryContext,
    input: Parameters<ScheduledTaskReadModel["show"]>[1],
  ): Promise<ScheduledTaskDefinitionSummary | null> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("scheduled-task", "show"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "scheduled-task",
        },
      },
      async () => {
        let query = executor
          .selectFrom("scheduled_task_definitions")
          .selectAll()
          .where("id", "=", input.taskId);

        if (input.resourceId) {
          query = query.where("resource_id", "=", input.resourceId);
        }

        const row = await query.executeTakeFirst();
        if (!row) {
          return null;
        }

        const latestRuns = await loadLatestRuns(executor, [row.id]);
        return toScheduledTaskDefinitionSummary(row, latestRuns.get(row.id));
      },
    );
  }
}

export class PgScheduledTaskRunReadModel implements ScheduledTaskRunReadModel {
  constructor(private readonly db: Kysely<Database>) {}

  async list(
    context: RepositoryContext,
    input: Parameters<ScheduledTaskRunReadModel["list"]>[1],
  ): Promise<Awaited<ReturnType<ScheduledTaskRunReadModel["list"]>>> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("scheduled-task-run", "list"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "scheduled-task-run",
        },
      },
      async () => {
        const limit = input.limit ?? 50;
        let query = executor
          .selectFrom("scheduled_task_run_attempts")
          .selectAll()
          .limit(limit + 1);

        if (input.taskId) {
          query = query.where("task_id", "=", input.taskId);
        }
        if (input.resourceId) {
          query = query.where("resource_id", "=", input.resourceId);
        }
        if (input.status) {
          query = query.where("status", "=", input.status);
        }
        if (input.triggerKind) {
          query = query.where("trigger_kind", "=", input.triggerKind);
        }
        if (input.cursor) {
          query = query.where("created_at", "<", input.cursor);
        }

        const rows = await query.orderBy("created_at", "desc").orderBy("id", "desc").execute();
        const pageRows = rows.slice(0, limit);
        const nextCursor = rows.length > limit ? pageRows.at(-1)?.created_at : undefined;

        return {
          items: pageRows.map(toScheduledTaskRunSummary),
          ...(nextCursor ? { nextCursor: normalizeTimestamp(nextCursor) ?? nextCursor } : {}),
        };
      },
    );
  }

  async show(
    context: RepositoryContext,
    input: Parameters<ScheduledTaskRunReadModel["show"]>[1],
  ): Promise<ScheduledTaskRunSummary | null> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("scheduled-task-run", "show"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "scheduled-task-run",
        },
      },
      async () => {
        let query = executor
          .selectFrom("scheduled_task_run_attempts")
          .selectAll()
          .where("id", "=", input.runId);

        if (input.taskId) {
          query = query.where("task_id", "=", input.taskId);
        }
        if (input.resourceId) {
          query = query.where("resource_id", "=", input.resourceId);
        }

        const row = await query.executeTakeFirst();
        return row ? toScheduledTaskRunSummary(row) : null;
      },
    );
  }
}

export class PgScheduledTaskRunLogReadModel implements ScheduledTaskRunLogReadModel {
  constructor(private readonly db: Kysely<Database>) {}

  async read(
    context: RepositoryContext,
    input: Parameters<ScheduledTaskRunLogReadModel["read"]>[1],
  ): Promise<Omit<ScheduledTaskRunLogsResult, "schemaVersion" | "generatedAt">> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("scheduled-task-run-log", "read"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "scheduled-task-run-log",
        },
      },
      async () => {
        let runQuery = executor
          .selectFrom("scheduled_task_run_attempts")
          .select(["id", "task_id", "resource_id"])
          .where("id", "=", input.runId);

        if (input.taskId) {
          runQuery = runQuery.where("task_id", "=", input.taskId);
        }
        if (input.resourceId) {
          runQuery = runQuery.where("resource_id", "=", input.resourceId);
        }

        const run = await runQuery.executeTakeFirst();
        if (!run) {
          return {
            runId: input.runId,
            taskId: input.taskId ?? "",
            resourceId: input.resourceId ?? "",
            entries: [],
          };
        }

        const limit = input.limit ?? 100;
        let query = executor
          .selectFrom("scheduled_task_run_logs")
          .selectAll()
          .where("run_id", "=", run.id)
          .limit(limit + 1);

        if (input.cursor) {
          query = query.where("logged_at", ">", input.cursor);
        }

        const rows = await query.orderBy("logged_at", "asc").orderBy("id", "asc").execute();
        const pageRows = rows.slice(0, limit);
        const nextCursor = rows.length > limit ? pageRows.at(-1)?.logged_at : undefined;

        return {
          runId: run.id,
          taskId: run.task_id,
          resourceId: run.resource_id,
          entries: pageRows.map(toScheduledTaskRunLogEntry),
          ...(nextCursor ? { nextCursor: normalizeTimestamp(nextCursor) ?? nextCursor } : {}),
        };
      },
    );
  }
}
