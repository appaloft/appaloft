import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { RollbackDeploymentCommand } from "./rollback-deployment.command";
import { type RollbackDeploymentUseCase } from "./rollback-deployment.use-case";

@CommandHandler(RollbackDeploymentCommand)
@injectable()
export class RollbackDeploymentCommandHandler
  implements CommandHandlerContract<RollbackDeploymentCommand, { id: string }>
{
  constructor(
    @inject(tokens.rollbackDeploymentUseCase)
    private readonly useCase: RollbackDeploymentUseCase,
  ) {}

  handle(context: ExecutionContext, command: RollbackDeploymentCommand) {
    return this.useCase.execute(context, {
      deploymentId: command.deploymentId,
      rollbackCandidateDeploymentId: command.rollbackCandidateDeploymentId,
      ...(command.resourceId ? { resourceId: command.resourceId } : {}),
      ...(command.readinessGeneratedAt
        ? { readinessGeneratedAt: command.readinessGeneratedAt }
        : {}),
    });
  }
}
