import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ProviderJobLogPruneResult } from "../../ports";
import { tokens } from "../../tokens";
import { PruneProviderJobLogsCommand } from "./prune-provider-job-logs.command";
import { type PruneProviderJobLogsUseCase } from "./prune-provider-job-logs.use-case";

@CommandHandler(PruneProviderJobLogsCommand)
@injectable()
export class PruneProviderJobLogsCommandHandler
  implements CommandHandlerContract<PruneProviderJobLogsCommand, ProviderJobLogPruneResult>
{
  constructor(
    @inject(tokens.pruneProviderJobLogsUseCase)
    private readonly useCase: PruneProviderJobLogsUseCase,
  ) {}

  handle(context: ExecutionContext, command: PruneProviderJobLogsCommand) {
    return this.useCase.execute(context, command);
  }
}
