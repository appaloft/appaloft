import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  PrepareServerRuntimeCommand,
  type PrepareServerRuntimeResult,
} from "./prepare-server-runtime.command";
import { type PrepareServerRuntimeUseCase } from "./prepare-server-runtime.use-case";

@CommandHandler(PrepareServerRuntimeCommand)
@injectable()
export class PrepareServerRuntimeCommandHandler
  implements CommandHandlerContract<PrepareServerRuntimeCommand, PrepareServerRuntimeResult>
{
  constructor(
    @inject(tokens.prepareServerRuntimeUseCase)
    private readonly useCase: PrepareServerRuntimeUseCase,
  ) {}

  handle(context: ExecutionContext, command: PrepareServerRuntimeCommand) {
    return this.useCase.execute(context, command.input);
  }
}
