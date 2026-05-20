import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  EvaluateDeploymentOverlayCommand,
  type EvaluateDeploymentOverlayResponse,
} from "./evaluate-deployment-overlay.command";
import { type EvaluateDeploymentOverlayUseCase } from "./evaluate-deployment-overlay.use-case";

@CommandHandler(EvaluateDeploymentOverlayCommand)
@injectable()
export class EvaluateDeploymentOverlayCommandHandler
  implements
    CommandHandlerContract<EvaluateDeploymentOverlayCommand, EvaluateDeploymentOverlayResponse>
{
  constructor(
    @inject(tokens.evaluateDeploymentOverlayUseCase)
    private readonly useCase: EvaluateDeploymentOverlayUseCase,
  ) {}

  async handle(context: ExecutionContext, command: EvaluateDeploymentOverlayCommand) {
    return this.useCase.execute(context, command);
  }
}
