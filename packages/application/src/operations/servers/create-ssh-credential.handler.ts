import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { CreateSshCredentialCommand } from "./create-ssh-credential.command";
import { type CreateSshCredentialUseCase } from "./create-ssh-credential.use-case";

@CommandHandler(CreateSshCredentialCommand)
@injectable()
export class CreateSshCredentialCommandHandler
  implements CommandHandlerContract<CreateSshCredentialCommand, { id: string }>
{
  constructor(
    @inject(tokens.createSshCredentialUseCase)
    private readonly useCase: CreateSshCredentialUseCase,
  ) {}

  handle(context: ExecutionContext, command: CreateSshCredentialCommand) {
    return this.useCase.execute(context, {
      name: command.name,
      kind: command.kind,
      privateKey: command.privateKey,
      ...(command.username ? { username: command.username } : {}),
      ...(command.publicKey ? { publicKey: command.publicKey } : {}),
    });
  }
}
