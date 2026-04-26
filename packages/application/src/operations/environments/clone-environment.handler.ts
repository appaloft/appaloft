import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { CloneEnvironmentCommand } from "./clone-environment.command";
import { type CloneEnvironmentUseCase } from "./clone-environment.use-case";

@CommandHandler(CloneEnvironmentCommand)
@injectable()
export class CloneEnvironmentCommandHandler
  implements CommandHandlerContract<CloneEnvironmentCommand, { id: string }>
{
  constructor(
    @inject(tokens.cloneEnvironmentUseCase)
    private readonly useCase: CloneEnvironmentUseCase,
  ) {}

  handle(context: ExecutionContext, command: CloneEnvironmentCommand) {
    return this.useCase.execute(context, {
      environmentId: command.environmentId,
      targetName: command.targetName,
      ...(command.targetKind ? { targetKind: command.targetKind } : {}),
    });
  }
}
