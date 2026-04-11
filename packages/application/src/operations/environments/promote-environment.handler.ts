import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { PromoteEnvironmentCommand } from "./promote-environment.command";
import { type PromoteEnvironmentUseCase } from "./promote-environment.use-case";

@CommandHandler(PromoteEnvironmentCommand)
@injectable()
export class PromoteEnvironmentCommandHandler
  implements CommandHandlerContract<PromoteEnvironmentCommand, { id: string }>
{
  constructor(
    @inject(tokens.promoteEnvironmentUseCase)
    private readonly useCase: PromoteEnvironmentUseCase,
  ) {}

  handle(context: ExecutionContext, command: PromoteEnvironmentCommand) {
    return this.useCase.execute(context, {
      environmentId: command.environmentId,
      targetName: command.targetName,
      targetKind: command.targetKind,
    });
  }
}
