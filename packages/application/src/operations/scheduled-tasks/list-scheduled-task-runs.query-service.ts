import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type ListScheduledTaskRunsResult,
  type ScheduledTaskRunReadModel,
} from "../../ports";
import { tokens } from "../../tokens";

type ListScheduledTaskRunsInput = Parameters<ScheduledTaskRunReadModel["list"]>[1];

@injectable()
export class ListScheduledTaskRunsQueryService {
  constructor(
    @inject(tokens.scheduledTaskRunReadModel)
    private readonly readModel: ScheduledTaskRunReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ListScheduledTaskRunsInput = {},
  ): Promise<ListScheduledTaskRunsResult> {
    return {
      schemaVersion: "scheduled-task-runs.list/v1",
      ...(await this.readModel.list(toRepositoryContext(context), input)),
      generatedAt: this.clock.now(),
    };
  }
}
