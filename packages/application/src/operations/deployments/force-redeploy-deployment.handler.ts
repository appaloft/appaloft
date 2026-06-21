import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ForceRedeployDeploymentCommand } from "./force-redeploy-deployment.command";
import { type ForceRedeployDeploymentUseCase } from "./force-redeploy-deployment.use-case";

@CommandHandler(ForceRedeployDeploymentCommand)
@injectable()
export class ForceRedeployDeploymentCommandHandler
  implements CommandHandlerContract<ForceRedeployDeploymentCommand, { id: string }>
{
  constructor(
    @inject(tokens.forceRedeployDeploymentUseCase)
    private readonly useCase: ForceRedeployDeploymentUseCase,
  ) {}

  handle(context: ExecutionContext, command: ForceRedeployDeploymentCommand) {
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
