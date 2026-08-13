import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  CleanupDeploymentRuntimeCommand,
  type CleanupDeploymentRuntimeResponse,
} from "./cleanup-deployment-runtime.command";
import { type CleanupDeploymentRuntimeUseCase } from "./cleanup-deployment-runtime.use-case";

@CommandHandler(CleanupDeploymentRuntimeCommand)
@injectable()
export class CleanupDeploymentRuntimeCommandHandler
  implements
    CommandHandlerContract<CleanupDeploymentRuntimeCommand, CleanupDeploymentRuntimeResponse>
{
  constructor(
    @inject(tokens.cleanupDeploymentRuntimeUseCase)
    private readonly useCase: CleanupDeploymentRuntimeUseCase,
  ) {}

  handle(context: ExecutionContext, command: CleanupDeploymentRuntimeCommand) {
    return this.useCase.execute(context, {
      deploymentId: command.deploymentId,
      confirm: command.confirm,
      ...(command.resourceId ? { resourceId: command.resourceId } : {}),
    });
  }
}
