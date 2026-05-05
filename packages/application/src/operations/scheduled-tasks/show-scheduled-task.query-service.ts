import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type Clock, type ScheduledTaskReadModel, type ShowScheduledTaskResult } from "../../ports";
import { tokens } from "../../tokens";

type ShowScheduledTaskInput = Parameters<ScheduledTaskReadModel["show"]>[1];

@injectable()
export class ShowScheduledTaskQueryService {
  constructor(
    @inject(tokens.scheduledTaskReadModel)
    private readonly readModel: ScheduledTaskReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ShowScheduledTaskInput,
  ): Promise<Result<ShowScheduledTaskResult>> {
    const task = await this.readModel.show(toRepositoryContext(context), input);
    if (!task) {
      const notFound = domainError.notFound("scheduled task", input.taskId);
      return err({
        ...notFound,
        details: {
          ...(notFound.details ?? {}),
          queryName: "scheduled-tasks.show",
          phase: "scheduled-task-read",
          taskId: input.taskId,
          ...(input.resourceId ? { resourceId: input.resourceId } : {}),
        },
      });
    }

    return ok({
      schemaVersion: "scheduled-tasks.show/v1",
      task,
      generatedAt: this.clock.now(),
    });
  }
}
