import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { CancelOperatorWorkCommand } from "./cancel-operator-work.command";
import {
  type CancelOperatorWorkResult,
  type CancelOperatorWorkUseCase,
} from "./cancel-operator-work.use-case";

@CommandHandler(CancelOperatorWorkCommand)
@injectable()
export class CancelOperatorWorkCommandHandler
  implements CommandHandlerContract<CancelOperatorWorkCommand, CancelOperatorWorkResult>
{
  constructor(
    @inject(tokens.cancelOperatorWorkUseCase)
    private readonly useCase: CancelOperatorWorkUseCase,
  ) {}

  handle(context: ExecutionContext, command: CancelOperatorWorkCommand) {
    return this.useCase.execute(context, {
      workId: command.workId,
      reason: command.reason,
    });
  }
}
