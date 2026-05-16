import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  ArchiveDeploymentCommand,
  type ArchiveDeploymentResponse,
} from "./archive-deployment.command";
import { type ArchiveDeploymentUseCase } from "./archive-deployment.use-case";

@CommandHandler(ArchiveDeploymentCommand)
@injectable()
export class ArchiveDeploymentCommandHandler
  implements CommandHandlerContract<ArchiveDeploymentCommand, ArchiveDeploymentResponse>
{
  constructor(
    @inject(tokens.archiveDeploymentUseCase)
    private readonly useCase: ArchiveDeploymentUseCase,
  ) {}

  handle(context: ExecutionContext, command: ArchiveDeploymentCommand) {
    return this.useCase.execute(context, {
      deploymentId: command.deploymentId,
      confirm: command.confirm,
      ...(command.resourceId ? { resourceId: command.resourceId } : {}),
    });
  }
}
