import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { CreateDeployTokenCommand } from "./create-deploy-token.command";
import {
  type CreateDeployTokenUseCase,
  type CreateDeployTokenUseCaseResult,
} from "./create-deploy-token.use-case";

@CommandHandler(CreateDeployTokenCommand)
@injectable()
export class CreateDeployTokenCommandHandler
  implements CommandHandlerContract<CreateDeployTokenCommand, CreateDeployTokenUseCaseResult>
{
  constructor(
    @inject(tokens.createDeployTokenUseCase)
    private readonly useCase: CreateDeployTokenUseCase,
  ) {}

  handle(context: ExecutionContext, command: CreateDeployTokenCommand) {
    return this.useCase.execute(context, {
      organizationId: command.organizationId,
      displayName: command.displayName,
      scope: command.scope,
      ...(command.expiresAt ? { expiresAt: command.expiresAt } : {}),
    });
  }
}
