import {
  CreatedAt,
  domainError,
  err,
  ok,
  ResourceByIdSpec,
  ResourceId,
  type Result,
  ScheduledTaskDefinitionByIdSpec,
  ScheduledTaskId,
  ScheduledTaskRunAttempt,
  ScheduledTaskRunId,
  ScheduledTaskRunTriggerKindValue,
  safeTry,
  UpsertScheduledTaskRunAttemptSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type IdGenerator,
  type ResourceRepository,
  type RunScheduledTaskNowResult,
  type ScheduledTaskDefinitionRepository,
  type ScheduledTaskRunAttemptRepository,
  type ScheduledTaskRunSummary,
} from "../../ports";
import { tokens } from "../../tokens";
import { type RunScheduledTaskNowCommandInput } from "./run-scheduled-task-now.command";

function runSummaryFromAttempt(runAttempt: ScheduledTaskRunAttempt): ScheduledTaskRunSummary {
  const state = runAttempt.toState();
  return {
    runId: state.id.value,
    taskId: state.taskId.value,
    resourceId: state.resourceId.value,
    triggerKind: state.triggerKind.value,
    status: state.status.value,
    createdAt: state.createdAt.value,
    ...(state.startedAt ? { startedAt: state.startedAt.value } : {}),
    ...(state.finishedAt ? { finishedAt: state.finishedAt.value } : {}),
    ...(state.exitCode ? { exitCode: state.exitCode.value } : {}),
    ...(state.failureSummary ? { failureSummary: state.failureSummary.value } : {}),
    ...(state.skippedReason ? { skippedReason: state.skippedReason.value } : {}),
  };
}

@injectable()
export class RunScheduledTaskNowUseCase {
  constructor(
    @inject(tokens.scheduledTaskDefinitionRepository)
    private readonly scheduledTaskDefinitionRepository: ScheduledTaskDefinitionRepository,
    @inject(tokens.scheduledTaskRunAttemptRepository)
    private readonly scheduledTaskRunAttemptRepository: ScheduledTaskRunAttemptRepository,
    @inject(tokens.resourceRepository)
    private readonly resourceRepository: ResourceRepository,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    input: RunScheduledTaskNowCommandInput,
  ): Promise<Result<RunScheduledTaskNowResult>> {
    const {
      clock,
      idGenerator,
      resourceRepository,
      scheduledTaskDefinitionRepository,
      scheduledTaskRunAttemptRepository,
    } = this;
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
            phase: "scheduled-task-run-admission",
            taskId: taskId.value,
            resourceId: resourceId.value,
          }),
        );
      }

      if (!task.isEnabled()) {
        return err(
          domainError.conflict("Scheduled task must be enabled before run-now admission", {
            phase: "scheduled-task-run-admission",
            taskId: taskId.value,
            resourceId: resourceId.value,
            status: task.toState().status.value,
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
          domainError.resourceArchived("Resource lifecycle blocks scheduled task run-now", {
            phase: "scheduled-task-run-admission",
            resourceId: resourceId.value,
            taskId: taskId.value,
            lifecycleStatus: resourceState.lifecycleStatus.value,
          }),
        );
      }

      const createdAt = yield* CreatedAt.create(input.requestedAt ?? clock.now());
      const runAttempt = yield* ScheduledTaskRunAttempt.create({
        id: ScheduledTaskRunId.rehydrate(idGenerator.next("str")),
        taskId,
        resourceId,
        triggerKind: ScheduledTaskRunTriggerKindValue.manual(),
        createdAt,
      });

      await scheduledTaskRunAttemptRepository.upsert(
        repositoryContext,
        runAttempt,
        UpsertScheduledTaskRunAttemptSpec.fromRunAttempt(runAttempt),
      );

      return ok({
        schemaVersion: "scheduled-tasks.run-now/v1",
        run: runSummaryFromAttempt(runAttempt),
      } satisfies RunScheduledTaskNowResult);
    });
  }
}
