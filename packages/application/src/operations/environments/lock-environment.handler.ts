import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { LockEnvironmentCommand } from "./lock-environment.command";
import { type LockEnvironmentUseCase } from "./lock-environment.use-case";

@CommandHandler(LockEnvironmentCommand)
@injectable()
export class LockEnvironmentCommandHandler
  implements CommandHandlerContract<LockEnvironmentCommand, { id: string }>
{
  constructor(
    @inject(tokens.lockEnvironmentUseCase)
    private readonly useCase: LockEnvironmentUseCase,
  ) {}

  handle(context: ExecutionContext, command: LockEnvironmentCommand) {
    return this.useCase.execute(context, command);
  }
}
