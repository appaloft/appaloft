import {
  appaloftTraceAttributes,
  createReadModelSpanName,
  createRepositorySpanName,
  type ListScheduledTasksResult,
  type RepositoryContext,
  type ScheduledTaskDefinitionRepository,
  type ScheduledTaskDefinitionSummary,
  type ScheduledTaskReadModel,
} from "@appaloft/application";
import {
  CreatedAt,
  type DeleteScheduledTaskDefinitionSpec,
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
  ScheduledTaskScheduleExpression,
  ScheduledTaskTimeoutSeconds,
  ScheduledTaskTimezone,
  type UpsertScheduledTaskDefinitionSpec,
} from "@appaloft/core";
import { type Insertable, type Kysely, type Selectable, type SelectQueryBuilder } from "kysely";

import { type Database } from "../schema";
import { normalizeTimestamp, resolveRepositoryExecutor, withRepositoryTransaction } from "./shared";

type ScheduledTaskDefinitionRow = Selectable<Database["scheduled_task_definitions"]>;
type ScheduledTaskDefinitionSelectionQuery = SelectQueryBuilder<
  Database,
  "scheduled_task_definitions",
  ScheduledTaskDefinitionRow
>;
type ScheduledTaskDefinitionSelectionApplier = (
  query: ScheduledTaskDefinitionSelectionQuery,
) => ScheduledTaskDefinitionSelectionQuery;
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

function toScheduledTaskDefinitionSummary(
  row: ScheduledTaskDefinitionRow,
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
  };
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

        return {
          items: pageRows.map(toScheduledTaskDefinitionSummary),
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
        return row ? toScheduledTaskDefinitionSummary(row) : null;
      },
    );
  }
}
