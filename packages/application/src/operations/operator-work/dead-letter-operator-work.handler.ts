import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { DeadLetterOperatorWorkCommand } from "./dead-letter-operator-work.command";
import {
  type DeadLetterOperatorWorkResult,
  type DeadLetterOperatorWorkUseCase,
} from "./dead-letter-operator-work.use-case";

@CommandHandler(DeadLetterOperatorWorkCommand)
@injectable()
export class DeadLetterOperatorWorkCommandHandler
  implements CommandHandlerContract<DeadLetterOperatorWorkCommand, DeadLetterOperatorWorkResult>
{
  constructor(
    @inject(tokens.deadLetterOperatorWorkUseCase)
    private readonly useCase: DeadLetterOperatorWorkUseCase,
  ) {}

  handle(context: ExecutionContext, command: DeadLetterOperatorWorkCommand) {
    return this.useCase.execute(context, {
      workId: command.workId,
      reason: command.reason,
    });
  }
}
