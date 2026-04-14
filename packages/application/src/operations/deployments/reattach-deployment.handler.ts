import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  ReattachDeploymentCommand,
  type ReattachDeploymentResult,
} from "./reattach-deployment.command";
import { type ReattachDeploymentUseCase } from "./reattach-deployment.use-case";

@CommandHandler(ReattachDeploymentCommand)
@injectable()
export class ReattachDeploymentCommandHandler
  implements CommandHandlerContract<ReattachDeploymentCommand, ReattachDeploymentResult>
{
  constructor(
    @inject(tokens.reattachDeploymentUseCase)
    private readonly useCase: ReattachDeploymentUseCase,
  ) {}

  handle(context: ExecutionContext, command: ReattachDeploymentCommand) {
    return this.useCase.execute(context, {
      deploymentId: command.deploymentId,
    });
  }
}
