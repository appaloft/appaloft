import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type ListScheduledTasksResult,
  type ScheduledTaskReadModel,
} from "../../ports";
import { tokens } from "../../tokens";

type ListScheduledTasksInput = Parameters<ScheduledTaskReadModel["list"]>[1];

@injectable()
export class ListScheduledTasksQueryService {
  constructor(
    @inject(tokens.scheduledTaskReadModel)
    private readonly readModel: ScheduledTaskReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ListScheduledTasksInput = {},
  ): Promise<ListScheduledTasksResult> {
    return {
      schemaVersion: "scheduled-tasks.list/v1",
      ...(await this.readModel.list(toRepositoryContext(context), input)),
      generatedAt: this.clock.now(),
    };
  }
}
