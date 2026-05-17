import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { CreateActionSourceLinkDeploymentCommand } from "./create-action-source-link-deployment.command";
import { type CreateActionSourceLinkDeploymentResponse } from "./create-action-source-link-deployment.schema";
import { type CreateActionSourceLinkDeploymentUseCase } from "./create-action-source-link-deployment.use-case";

@CommandHandler(CreateActionSourceLinkDeploymentCommand)
@injectable()
export class CreateActionSourceLinkDeploymentCommandHandler
  implements
    CommandHandlerContract<
      CreateActionSourceLinkDeploymentCommand,
      CreateActionSourceLinkDeploymentResponse
    >
{
  constructor(
    @inject(tokens.createActionSourceLinkDeploymentUseCase)
    private readonly useCase: CreateActionSourceLinkDeploymentUseCase,
  ) {}

  handle(context: ExecutionContext, command: CreateActionSourceLinkDeploymentCommand) {
    return this.useCase.execute(context, {
      sourceFingerprint: command.sourceFingerprint,
      ...(command.projectId ? { projectId: command.projectId } : {}),
      ...(command.environmentId ? { environmentId: command.environmentId } : {}),
      ...(command.resourceId ? { resourceId: command.resourceId } : {}),
      ...(command.serverId ? { serverId: command.serverId } : {}),
      ...(command.destinationId ? { destinationId: command.destinationId } : {}),
      ...(command.trustedContext ? { trustedContext: command.trustedContext } : {}),
      ...(command.authorizedTokenScope
        ? { authorizedTokenScope: command.authorizedTokenScope }
        : {}),
    });
  }
}
