import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type DeploymentHealthResult } from "../../ports";
import { tokens } from "../../tokens";
import { CheckDeploymentHealthCommand } from "./check-deployment-health.command";
import { type CheckDeploymentHealthUseCase } from "./check-deployment-health.use-case";

@CommandHandler(CheckDeploymentHealthCommand)
@injectable()
export class CheckDeploymentHealthCommandHandler
  implements CommandHandlerContract<CheckDeploymentHealthCommand, DeploymentHealthResult>
{
  constructor(
    @inject(tokens.checkDeploymentHealthUseCase)
    private readonly useCase: CheckDeploymentHealthUseCase,
  ) {}

  handle(context: ExecutionContext, command: CheckDeploymentHealthCommand) {
    return this.useCase.execute(context, {
      deploymentId: command.deploymentId,
    });
  }
}
