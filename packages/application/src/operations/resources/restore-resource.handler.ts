import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { RestoreResourceCommand } from "./restore-resource.command";
import { type RestoreResourceUseCase } from "./restore-resource.use-case";

@CommandHandler(RestoreResourceCommand)
@injectable()
export class RestoreResourceCommandHandler
  implements CommandHandlerContract<RestoreResourceCommand, { id: string }>
{
  constructor(
    @inject(tokens.restoreResourceUseCase)
    private readonly useCase: RestoreResourceUseCase,
  ) {}

  handle(context: ExecutionContext, command: RestoreResourceCommand) {
    return this.useCase.execute(context, command);
  }
}
