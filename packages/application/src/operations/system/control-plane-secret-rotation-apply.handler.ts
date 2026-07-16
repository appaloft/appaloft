import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ControlPlaneSecretRotationApplyResult } from "../../ports";
import { tokens } from "../../tokens";
import { ControlPlaneSecretRotationApplyCommand } from "./control-plane-secret-rotation-apply.command";
import { type ControlPlaneSecretRotationApplyUseCase } from "./control-plane-secret-rotation-apply.use-case";

@CommandHandler(ControlPlaneSecretRotationApplyCommand)
@injectable()
export class ControlPlaneSecretRotationApplyCommandHandler
  implements
    CommandHandlerContract<
      ControlPlaneSecretRotationApplyCommand,
      ControlPlaneSecretRotationApplyResult
    >
{
  constructor(
    @inject(tokens.controlPlaneSecretRotationApplyUseCase)
    private readonly useCase: ControlPlaneSecretRotationApplyUseCase,
  ) {}

  handle(context: ExecutionContext, command: ControlPlaneSecretRotationApplyCommand) {
    return this.useCase.execute(context, command);
  }
}
