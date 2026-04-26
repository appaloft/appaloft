import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { UnlockEnvironmentCommand } from "./unlock-environment.command";
import { type UnlockEnvironmentUseCase } from "./unlock-environment.use-case";

@CommandHandler(UnlockEnvironmentCommand)
@injectable()
export class UnlockEnvironmentCommandHandler
  implements CommandHandlerContract<UnlockEnvironmentCommand, { id: string }>
{
  constructor(
    @inject(tokens.unlockEnvironmentUseCase)
    private readonly useCase: UnlockEnvironmentUseCase,
  ) {}

  handle(context: ExecutionContext, command: UnlockEnvironmentCommand) {
    return this.useCase.execute(context, command);
  }
}
