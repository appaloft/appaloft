import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  RotateSshCredentialCommand,
  type RotateSshCredentialCommandOutput,
} from "./rotate-ssh-credential.command";
import { type RotateSshCredentialUseCase } from "./rotate-ssh-credential.use-case";

@CommandHandler(RotateSshCredentialCommand)
@injectable()
export class RotateSshCredentialCommandHandler
  implements CommandHandlerContract<RotateSshCredentialCommand, RotateSshCredentialCommandOutput>
{
  constructor(
    @inject(tokens.rotateSshCredentialUseCase)
    private readonly useCase: RotateSshCredentialUseCase,
  ) {}

  handle(context: ExecutionContext, command: RotateSshCredentialCommand) {
    return this.useCase.execute(context, command);
  }
}
