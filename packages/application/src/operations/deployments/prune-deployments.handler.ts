import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type DeploymentAttemptPruneResult } from "../../ports";
import { tokens } from "../../tokens";
import { PruneDeploymentsCommand } from "./prune-deployments.command";
import { type PruneDeploymentsUseCase } from "./prune-deployments.use-case";

@CommandHandler(PruneDeploymentsCommand)
@injectable()
export class PruneDeploymentsCommandHandler
  implements CommandHandlerContract<PruneDeploymentsCommand, DeploymentAttemptPruneResult>
{
  constructor(
    @inject(tokens.pruneDeploymentsUseCase)
    private readonly useCase: PruneDeploymentsUseCase,
  ) {}

  handle(context: ExecutionContext, command: PruneDeploymentsCommand) {
    return this.useCase.execute(context, command);
  }
}
