import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { DeleteSshCredentialCommand } from "./delete-ssh-credential.command";
import { type DeleteSshCredentialUseCase } from "./delete-ssh-credential.use-case";

@CommandHandler(DeleteSshCredentialCommand)
@injectable()
export class DeleteSshCredentialCommandHandler
  implements CommandHandlerContract<DeleteSshCredentialCommand, { id: string }>
{
  constructor(
    @inject(tokens.deleteSshCredentialUseCase)
    private readonly useCase: DeleteSshCredentialUseCase,
  ) {}

  handle(context: ExecutionContext, command: DeleteSshCredentialCommand) {
    return this.useCase.execute(context, command);
  }
}
