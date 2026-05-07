import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { RedeployDeploymentCommand } from "./redeploy-deployment.command";
import { type RedeployDeploymentUseCase } from "./redeploy-deployment.use-case";

@CommandHandler(RedeployDeploymentCommand)
@injectable()
export class RedeployDeploymentCommandHandler
  implements CommandHandlerContract<RedeployDeploymentCommand, { id: string }>
{
  constructor(
    @inject(tokens.redeployDeploymentUseCase)
    private readonly useCase: RedeployDeploymentUseCase,
  ) {}

  handle(context: ExecutionContext, command: RedeployDeploymentCommand) {
    return this.useCase.execute(context, {
      resourceId: command.resourceId,
      ...(command.projectId ? { projectId: command.projectId } : {}),
      ...(command.environmentId ? { environmentId: command.environmentId } : {}),
      ...(command.serverId ? { serverId: command.serverId } : {}),
      ...(command.destinationId ? { destinationId: command.destinationId } : {}),
      ...(command.sourceDeploymentId ? { sourceDeploymentId: command.sourceDeploymentId } : {}),
      ...(command.readinessGeneratedAt
        ? { readinessGeneratedAt: command.readinessGeneratedAt }
        : {}),
    });
  }
}
