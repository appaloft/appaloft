import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { CreateDeploymentCommand } from "./create-deployment.command";
import { type CreateDeploymentUseCase } from "./create-deployment.use-case";

@CommandHandler(CreateDeploymentCommand)
@injectable()
export class CreateDeploymentCommandHandler
  implements CommandHandlerContract<CreateDeploymentCommand, { id: string }>
{
  constructor(
    @inject(tokens.createDeploymentUseCase)
    private readonly useCase: CreateDeploymentUseCase,
  ) {}

  handle(context: ExecutionContext, command: CreateDeploymentCommand) {
    return this.useCase.execute(context, {
      projectId: command.projectId,
      serverId: command.serverId,
      ...(command.destinationId ? { destinationId: command.destinationId } : {}),
      environmentId: command.environmentId,
      resourceId: command.resourceId,
    });
  }
}
