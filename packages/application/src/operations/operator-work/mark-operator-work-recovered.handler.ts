import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { MarkOperatorWorkRecoveredCommand } from "./mark-operator-work-recovered.command";
import {
  type MarkOperatorWorkRecoveredResult,
  type MarkOperatorWorkRecoveredUseCase,
} from "./mark-operator-work-recovered.use-case";

@CommandHandler(MarkOperatorWorkRecoveredCommand)
@injectable()
export class MarkOperatorWorkRecoveredCommandHandler
  implements
    CommandHandlerContract<MarkOperatorWorkRecoveredCommand, MarkOperatorWorkRecoveredResult>
{
  constructor(
    @inject(tokens.markOperatorWorkRecoveredUseCase)
    private readonly useCase: MarkOperatorWorkRecoveredUseCase,
  ) {}

  handle(context: ExecutionContext, command: MarkOperatorWorkRecoveredCommand) {
    return this.useCase.execute(context, {
      workId: command.workId,
      ...(command.reason ? { reason: command.reason } : {}),
    });
  }
}
