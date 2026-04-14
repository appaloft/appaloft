import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { CancelDeploymentCommand } from "./cancel-deployment.command";
import { type CancelDeploymentUseCase } from "./cancel-deployment.use-case";

@CommandHandler(CancelDeploymentCommand)
@injectable()
export class CancelDeploymentCommandHandler
  implements CommandHandlerContract<CancelDeploymentCommand, { id: string; status: "canceled" }>
{
  constructor(
    @inject(tokens.cancelDeploymentUseCase)
    private readonly useCase: CancelDeploymentUseCase,
  ) {}

  handle(context: ExecutionContext, command: CancelDeploymentCommand) {
    return this.useCase.execute(context, {
      deploymentId: command.deploymentId,
      ...(command.reason ? { reason: command.reason } : {}),
    });
  }
}
