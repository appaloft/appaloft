import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type ScheduledTaskRunLogReadModel,
  type ScheduledTaskRunLogsResult,
} from "../../ports";
import { tokens } from "../../tokens";

type ScheduledTaskRunLogsInput = Parameters<ScheduledTaskRunLogReadModel["read"]>[1];

@injectable()
export class ScheduledTaskRunLogsQueryService {
  constructor(
    @inject(tokens.scheduledTaskRunLogReadModel)
    private readonly readModel: ScheduledTaskRunLogReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ScheduledTaskRunLogsInput,
  ): Promise<ScheduledTaskRunLogsResult> {
    return {
      schemaVersion: "scheduled-task-runs.logs/v1",
      ...(await this.readModel.read(toRepositoryContext(context), input)),
      generatedAt: this.clock.now(),
    };
  }
}
