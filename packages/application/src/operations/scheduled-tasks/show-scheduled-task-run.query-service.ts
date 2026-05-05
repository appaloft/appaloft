import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type ScheduledTaskRunReadModel,
  type ShowScheduledTaskRunResult,
} from "../../ports";
import { tokens } from "../../tokens";

type ShowScheduledTaskRunInput = Parameters<ScheduledTaskRunReadModel["show"]>[1];

@injectable()
export class ShowScheduledTaskRunQueryService {
  constructor(
    @inject(tokens.scheduledTaskRunReadModel)
    private readonly readModel: ScheduledTaskRunReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ShowScheduledTaskRunInput,
  ): Promise<Result<ShowScheduledTaskRunResult>> {
    const run = await this.readModel.show(toRepositoryContext(context), input);
    if (!run) {
      const notFound = domainError.notFound("scheduled task run", input.runId);
      return err({
        ...notFound,
        details: {
          ...(notFound.details ?? {}),
          queryName: "scheduled-task-runs.show",
          phase: "scheduled-task-run-read",
          runId: input.runId,
          ...(input.taskId ? { taskId: input.taskId } : {}),
          ...(input.resourceId ? { resourceId: input.resourceId } : {}),
        },
      });
    }

    return ok({
      schemaVersion: "scheduled-task-runs.show/v1",
      run,
      generatedAt: this.clock.now(),
    });
  }
}
