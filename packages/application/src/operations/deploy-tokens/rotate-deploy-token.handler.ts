import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { RotateDeployTokenCommand } from "./rotate-deploy-token.command";
import {
  type RotateDeployTokenUseCase,
  type RotateDeployTokenUseCaseResult,
} from "./rotate-deploy-token.use-case";

@CommandHandler(RotateDeployTokenCommand)
@injectable()
export class RotateDeployTokenCommandHandler
  implements CommandHandlerContract<RotateDeployTokenCommand, RotateDeployTokenUseCaseResult>
{
  constructor(
    @inject(tokens.rotateDeployTokenUseCase)
    private readonly useCase: RotateDeployTokenUseCase,
  ) {}

  handle(context: ExecutionContext, command: RotateDeployTokenCommand) {
    return this.useCase.execute(context, {
      tokenId: command.tokenId,
      organizationId: command.organizationId,
      confirmation: command.confirmation,
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
    });
  }
}
