import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type AccountProfileSummary } from "../../ports";
import { tokens } from "../../tokens";
import { ChangeAccountProfileCommand } from "./change-account-profile.command";
import { type ChangeAccountProfileUseCase } from "./change-account-profile.use-case";

@CommandHandler(ChangeAccountProfileCommand)
@injectable()
export class ChangeAccountProfileCommandHandler
  implements CommandHandlerContract<ChangeAccountProfileCommand, AccountProfileSummary>
{
  constructor(
    @inject(tokens.changeAccountProfileUseCase)
    private readonly useCase: ChangeAccountProfileUseCase,
  ) {}

  handle(context: ExecutionContext, command: ChangeAccountProfileCommand) {
    return this.useCase.execute(context, {
      ...(command.displayName !== undefined ? { displayName: command.displayName } : {}),
      ...(command.avatarUrl !== undefined ? { avatarUrl: command.avatarUrl } : {}),
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
    });
  }
}
