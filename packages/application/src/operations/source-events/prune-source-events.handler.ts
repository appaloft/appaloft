import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type SourceEventPruneResult } from "../../ports";
import { tokens } from "../../tokens";
import { PruneSourceEventsCommand } from "./prune-source-events.command";
import { type PruneSourceEventsUseCase } from "./prune-source-events.use-case";

@injectable()
@CommandHandler(PruneSourceEventsCommand)
export class PruneSourceEventsCommandHandler
  implements CommandHandlerContract<PruneSourceEventsCommand, SourceEventPruneResult>
{
  constructor(
    @inject(tokens.pruneSourceEventsUseCase)
    private readonly useCase: PruneSourceEventsUseCase,
  ) {}

  handle(context: ExecutionContext, command: PruneSourceEventsCommand) {
    return this.useCase.execute(context, command);
  }
}
