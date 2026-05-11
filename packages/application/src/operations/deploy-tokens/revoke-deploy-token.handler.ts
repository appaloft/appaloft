import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { RevokeDeployTokenCommand } from "./revoke-deploy-token.command";
import {
  type RevokeDeployTokenUseCase,
  type RevokeDeployTokenUseCaseResult,
} from "./revoke-deploy-token.use-case";

@CommandHandler(RevokeDeployTokenCommand)
@injectable()
export class RevokeDeployTokenCommandHandler
  implements CommandHandlerContract<RevokeDeployTokenCommand, RevokeDeployTokenUseCaseResult>
{
  constructor(
    @inject(tokens.revokeDeployTokenUseCase)
    private readonly useCase: RevokeDeployTokenUseCase,
  ) {}

  handle(context: ExecutionContext, command: RevokeDeployTokenCommand) {
    return this.useCase.execute(context, {
      tokenId: command.tokenId,
      organizationId: command.organizationId,
      confirmation: command.confirmation,
      ...(command.reason ? { reason: command.reason } : {}),
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
    });
  }
}
