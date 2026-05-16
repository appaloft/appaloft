import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ResetResourceHealthCommand } from "./reset-resource-health.command";
import { type ResetResourceHealthUseCase } from "./reset-resource-health.use-case";

@CommandHandler(ResetResourceHealthCommand)
@injectable()
export class ResetResourceHealthCommandHandler
  implements CommandHandlerContract<ResetResourceHealthCommand, { id: string }>
{
  constructor(
    @inject(tokens.resetResourceHealthUseCase)
    private readonly useCase: ResetResourceHealthUseCase,
  ) {}

  handle(context: ExecutionContext, command: ResetResourceHealthCommand) {
    return this.useCase.execute(context, { resourceId: command.resourceId });
  }
}
