import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ConnectionCallbackResult } from "../../ports";
import { tokens } from "../../tokens";
import { CompleteConnectionCallbackCommand } from "./complete-connection-callback.command";
import { type CompleteConnectionCallbackUseCase } from "./complete-connection-callback.use-case";

@CommandHandler(CompleteConnectionCallbackCommand)
@injectable()
export class CompleteConnectionCallbackCommandHandler
  implements CommandHandlerContract<CompleteConnectionCallbackCommand, ConnectionCallbackResult>
{
  constructor(
    @inject(tokens.completeConnectionCallbackUseCase)
    private readonly useCase: CompleteConnectionCallbackUseCase,
  ) {}

  handle(context: ExecutionContext, command: CompleteConnectionCallbackCommand) {
    void context;
    return this.useCase.execute(command.input);
  }
}
