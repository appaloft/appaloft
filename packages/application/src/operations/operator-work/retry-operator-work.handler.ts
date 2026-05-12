import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { RetryOperatorWorkCommand } from "./retry-operator-work.command";
import {
  type RetryOperatorWorkResult,
  type RetryOperatorWorkUseCase,
} from "./retry-operator-work.use-case";

@CommandHandler(RetryOperatorWorkCommand)
@injectable()
export class RetryOperatorWorkCommandHandler
  implements CommandHandlerContract<RetryOperatorWorkCommand, RetryOperatorWorkResult>
{
  constructor(
    @inject(tokens.retryOperatorWorkUseCase)
    private readonly useCase: RetryOperatorWorkUseCase,
  ) {}

  handle(context: ExecutionContext, command: RetryOperatorWorkCommand) {
    return this.useCase.execute(context, {
      workId: command.workId,
      ...(command.reason ? { reason: command.reason } : {}),
    });
  }
}
