import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type DeploymentLogPruneResult } from "../../ports";
import { tokens } from "../../tokens";
import { PruneDeploymentLogsCommand } from "./prune-deployment-logs.command";
import { type PruneDeploymentLogsUseCase } from "./prune-deployment-logs.use-case";

@CommandHandler(PruneDeploymentLogsCommand)
@injectable()
export class PruneDeploymentLogsCommandHandler
  implements CommandHandlerContract<PruneDeploymentLogsCommand, DeploymentLogPruneResult>
{
  constructor(
    @inject(tokens.pruneDeploymentLogsUseCase)
    private readonly useCase: PruneDeploymentLogsUseCase,
  ) {}

  handle(context: ExecutionContext, command: PruneDeploymentLogsCommand) {
    return this.useCase.execute(context, command);
  }
}
