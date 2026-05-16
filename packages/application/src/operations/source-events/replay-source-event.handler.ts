import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ReplaySourceEventResult } from "../../ports";
import { tokens } from "../../tokens";
import { ReplaySourceEventCommand } from "./replay-source-event.command";
import { type ReplaySourceEventUseCase } from "./replay-source-event.use-case";

@CommandHandler(ReplaySourceEventCommand)
@injectable()
export class ReplaySourceEventCommandHandler
  implements CommandHandlerContract<ReplaySourceEventCommand, ReplaySourceEventResult>
{
  constructor(
    @inject(tokens.replaySourceEventUseCase)
    private readonly useCase: ReplaySourceEventUseCase,
  ) {}

  handle(context: ExecutionContext, command: ReplaySourceEventCommand) {
    return this.useCase.execute(context, {
      sourceEventId: command.sourceEventId,
      ...(command.projectId ? { projectId: command.projectId } : {}),
      ...(command.resourceId ? { resourceId: command.resourceId } : {}),
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
    });
  }
}
