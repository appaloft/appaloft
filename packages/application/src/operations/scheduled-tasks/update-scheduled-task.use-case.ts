import {
  domainError,
  err,
  ok,
  ResourceByIdSpec,
  ResourceId,
  type Result,
  ScheduledTaskCommandIntent,
  ScheduledTaskConcurrencyPolicyValue,
  type ScheduledTaskDefinition,
  ScheduledTaskDefinitionByIdSpec,
  ScheduledTaskDefinitionStatusValue,
  ScheduledTaskId,
  ScheduledTaskRetryLimit,
  ScheduledTaskScheduleExpression,
  ScheduledTaskTimeoutSeconds,
  ScheduledTaskTimezone,
  safeTry,
  type UpdateScheduledTaskDefinitionInput,
  UpsertScheduledTaskDefinitionSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type ResourceRepository,
  type ScheduledTaskCommandResult,
  type ScheduledTaskDefinitionRepository,
  type ScheduledTaskDefinitionSummary,
} from "../../ports";
import { tokens } from "../../tokens";
import { type UpdateScheduledTaskCommandInput } from "./update-scheduled-task.command";

function taskSummaryFromDefinition(task: ScheduledTaskDefinition): ScheduledTaskDefinitionSummary {
  const state = task.toState();
  return {
    taskId: state.id.value,
    resourceId: state.resourceId.value,
    schedule: state.schedule.value,
    timezone: state.timezone.value,
    commandIntent: state.commandIntent.value,
    timeoutSeconds: state.timeoutSeconds.value,
    retryLimit: state.retryLimit.value,
    concurrencyPolicy: state.concurrencyPolicy.value,
    status: state.status.value,
    createdAt: state.createdAt.value,
  };
}

@injectable()
export class UpdateScheduledTaskUseCase {
  constructor(
    @inject(tokens.scheduledTaskDefinitionRepository)
    private readonly scheduledTaskDefinitionRepository: ScheduledTaskDefinitionRepository,
    @inject(tokens.resourceRepository)
    private readonly resourceRepository: ResourceRepository,
  ) {}

  async execute(
    context: ExecutionContext,
    input: UpdateScheduledTaskCommandInput,
  ): Promise<Result<ScheduledTaskCommandResult>> {
    const { resourceRepository, scheduledTaskDefinitionRepository } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const taskId = yield* ScheduledTaskId.create(input.taskId);
      const resourceId = yield* ResourceId.create(input.resourceId);
      const task = await scheduledTaskDefinitionRepository.findOne(
        repositoryContext,
        ScheduledTaskDefinitionByIdSpec.create(taskId, resourceId),
      );

      if (!task) {
        return err(domainError.notFound("scheduled task", taskId.value));
      }

      if (!task.belongsToResource(resourceId)) {
        return err(
          domainError.resourceContextMismatch("Scheduled task does not belong to Resource", {
            phase: "scheduled-task-update-admission",
            taskId: taskId.value,
            resourceId: resourceId.value,
          }),
        );
      }

      const resource = await resourceRepository.findOne(
        repositoryContext,
        ResourceByIdSpec.create(resourceId),
      );

      if (!resource) {
        return err(domainError.notFound("resource", resourceId.value));
      }

      const resourceState = resource.toState();
      if (resourceState.lifecycleStatus.isArchived() || resourceState.lifecycleStatus.isDeleted()) {
        return err(
          domainError.resourceArchived("Resource lifecycle blocks scheduled task update", {
            phase: "scheduled-task-update-admission",
            resourceId: resourceId.value,
            taskId: taskId.value,
            lifecycleStatus: resourceState.lifecycleStatus.value,
          }),
        );
      }

      const updates: UpdateScheduledTaskDefinitionInput = {};
      if (input.schedule !== undefined) {
        updates.schedule = yield* ScheduledTaskScheduleExpression.create(input.schedule);
      }
      if (input.timezone !== undefined) {
        updates.timezone = yield* ScheduledTaskTimezone.create(input.timezone);
      }
      if (input.commandIntent !== undefined) {
        updates.commandIntent = yield* ScheduledTaskCommandIntent.create(input.commandIntent);
      }
      if (input.timeoutSeconds !== undefined) {
        updates.timeoutSeconds = yield* ScheduledTaskTimeoutSeconds.create(input.timeoutSeconds);
      }
      if (input.retryLimit !== undefined) {
        updates.retryLimit = yield* ScheduledTaskRetryLimit.create(input.retryLimit);
      }
      if (input.concurrencyPolicy !== undefined) {
        updates.concurrencyPolicy = yield* ScheduledTaskConcurrencyPolicyValue.create(
          input.concurrencyPolicy,
        );
      }
      if (input.status !== undefined) {
        updates.status = yield* ScheduledTaskDefinitionStatusValue.create(input.status);
      }

      yield* task.update(updates);

      await scheduledTaskDefinitionRepository.upsert(
        repositoryContext,
        task,
        UpsertScheduledTaskDefinitionSpec.fromTaskDefinition(task),
      );

      return ok({
        schemaVersion: "scheduled-tasks.command/v1",
        task: taskSummaryFromDefinition(task),
      } satisfies ScheduledTaskCommandResult);
    });
  }
}
