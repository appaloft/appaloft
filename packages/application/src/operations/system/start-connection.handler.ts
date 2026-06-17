import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ConnectionStartResult } from "../../ports";
import { tokens } from "../../tokens";
import { StartConnectionCommand } from "./start-connection.command";
import { type StartConnectionUseCase } from "./start-connection.use-case";

@CommandHandler(StartConnectionCommand)
@injectable()
export class StartConnectionCommandHandler
  implements CommandHandlerContract<StartConnectionCommand, ConnectionStartResult>
{
  constructor(
    @inject(tokens.startConnectionUseCase)
    private readonly useCase: StartConnectionUseCase,
  ) {}

  handle(context: ExecutionContext, command: StartConnectionCommand) {
    return this.useCase.execute(context, command.input);
  }
}
