import {
  DeletedAt,
  DeleteScheduledTaskDefinitionSpec,
  domainError,
  err,
  ok,
  ResourceByIdSpec,
  ResourceId,
  type Result,
  ScheduledTaskDefinitionByIdSpec,
  ScheduledTaskId,
  safeTry,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type DeleteScheduledTaskResult,
  type ResourceRepository,
  type ScheduledTaskDefinitionRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { type DeleteScheduledTaskCommandInput } from "./delete-scheduled-task.command";

@injectable()
export class DeleteScheduledTaskUseCase {
  constructor(
    @inject(tokens.scheduledTaskDefinitionRepository)
    private readonly scheduledTaskDefinitionRepository: ScheduledTaskDefinitionRepository,
    @inject(tokens.resourceRepository)
    private readonly resourceRepository: ResourceRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    input: DeleteScheduledTaskCommandInput,
  ): Promise<Result<DeleteScheduledTaskResult>> {
    const { clock, resourceRepository, scheduledTaskDefinitionRepository } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const taskId = yield* ScheduledTaskId.create(input.taskId);
      const resourceId = yield* ResourceId.create(input.resourceId);
      const deletedAt = yield* DeletedAt.create(clock.now());
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
            phase: "scheduled-task-delete-admission",
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

      await scheduledTaskDefinitionRepository.delete(
        repositoryContext,
        DeleteScheduledTaskDefinitionSpec.create(taskId, resourceId),
      );

      return ok({
        schemaVersion: "scheduled-tasks.delete/v1",
        taskId: taskId.value,
        resourceId: resourceId.value,
        status: "deleted",
        deletedAt: deletedAt.value,
      } satisfies DeleteScheduledTaskResult);
    });
  }
}
