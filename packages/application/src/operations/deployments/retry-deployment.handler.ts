import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { RetryDeploymentCommand } from "./retry-deployment.command";
import { type RetryDeploymentUseCase } from "./retry-deployment.use-case";

@CommandHandler(RetryDeploymentCommand)
@injectable()
export class RetryDeploymentCommandHandler
  implements CommandHandlerContract<RetryDeploymentCommand, { id: string }>
{
  constructor(
    @inject(tokens.retryDeploymentUseCase)
    private readonly useCase: RetryDeploymentUseCase,
  ) {}

  handle(context: ExecutionContext, command: RetryDeploymentCommand) {
    return this.useCase.execute(context, {
      deploymentId: command.deploymentId,
      ...(command.resourceId ? { resourceId: command.resourceId } : {}),
      ...(command.readinessGeneratedAt
        ? { readinessGeneratedAt: command.readinessGeneratedAt }
        : {}),
    });
  }
}
