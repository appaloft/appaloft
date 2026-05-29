import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { DeleteAccountCommand } from "./delete-account.command";
import { type DeleteAccountUseCase } from "./delete-account.use-case";

@CommandHandler(DeleteAccountCommand)
@injectable()
export class DeleteAccountCommandHandler
  implements CommandHandlerContract<DeleteAccountCommand, { userId: string; deletedAt: string }>
{
  constructor(
    @inject(tokens.deleteAccountUseCase)
    private readonly useCase: DeleteAccountUseCase,
  ) {}

  handle(context: ExecutionContext, command: DeleteAccountCommand) {
    return this.useCase.execute(context, {
      confirmation: command.confirmation,
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
    });
  }
}
