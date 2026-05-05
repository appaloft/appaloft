import {
  CreatedAt,
  domainError,
  err,
  ok,
  ResourceByIdSpec,
  ResourceId,
  type Result,
  ScheduledTaskCommandIntent,
  ScheduledTaskConcurrencyPolicyValue,
  ScheduledTaskDefinition,
  ScheduledTaskDefinitionStatusValue,
  ScheduledTaskId,
  ScheduledTaskRetryLimit,
  ScheduledTaskScheduleExpression,
  ScheduledTaskTimeoutSeconds,
  ScheduledTaskTimezone,
  safeTry,
  UpsertScheduledTaskDefinitionSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type IdGenerator,
  type ResourceRepository,
  type ScheduledTaskCommandResult,
  type ScheduledTaskDefinitionRepository,
  type ScheduledTaskDefinitionSummary,
} from "../../ports";
import { tokens } from "../../tokens";
import { type CreateScheduledTaskCommandInput } from "./create-scheduled-task.command";

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
export class CreateScheduledTaskUseCase {
  constructor(
    @inject(tokens.scheduledTaskDefinitionRepository)
    private readonly scheduledTaskDefinitionRepository: ScheduledTaskDefinitionRepository,
    @inject(tokens.resourceRepository)
    private readonly resourceRepository: ResourceRepository,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    input: CreateScheduledTaskCommandInput,
  ): Promise<Result<ScheduledTaskCommandResult>> {
    const { clock, idGenerator, resourceRepository, scheduledTaskDefinitionRepository } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const resourceId = yield* ResourceId.create(input.resourceId);
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
          domainError.resourceArchived("Resource lifecycle blocks scheduled task creation", {
            phase: "scheduled-task-create-admission",
            resourceId: resourceId.value,
            lifecycleStatus: resourceState.lifecycleStatus.value,
          }),
        );
      }

      const schedule = yield* ScheduledTaskScheduleExpression.create(input.schedule);
      const timezone = yield* ScheduledTaskTimezone.create(input.timezone);
      const commandIntent = yield* ScheduledTaskCommandIntent.create(input.commandIntent);
      const timeoutSeconds = yield* ScheduledTaskTimeoutSeconds.create(input.timeoutSeconds);
      const retryLimit = yield* ScheduledTaskRetryLimit.create(input.retryLimit);
      const concurrencyPolicy = yield* ScheduledTaskConcurrencyPolicyValue.create(
        input.concurrencyPolicy ?? "forbid",
      );
      const status = yield* ScheduledTaskDefinitionStatusValue.create(input.status ?? "enabled");
      const createdAt = yield* CreatedAt.create(clock.now());
      const task = yield* ScheduledTaskDefinition.create({
        id: ScheduledTaskId.rehydrate(idGenerator.next("tsk")),
        resourceId,
        schedule,
        timezone,
        commandIntent,
        timeoutSeconds,
        retryLimit,
        concurrencyPolicy,
        status,
        createdAt,
      });

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
