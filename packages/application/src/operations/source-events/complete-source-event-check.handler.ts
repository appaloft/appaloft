import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type CompleteSourceEventCheckResult } from "../../ports";
import { tokens } from "../../tokens";
import { CompleteSourceEventCheckCommand } from "./complete-source-event-check.command";
import { type IngestSourceEventUseCase } from "./ingest-source-event.use-case";

@CommandHandler(CompleteSourceEventCheckCommand)
@injectable()
export class CompleteSourceEventCheckCommandHandler
  implements CommandHandlerContract<CompleteSourceEventCheckCommand, CompleteSourceEventCheckResult>
{
  constructor(
    @inject(tokens.ingestSourceEventUseCase)
    private readonly useCase: IngestSourceEventUseCase,
  ) {}

  handle(context: ExecutionContext, command: CompleteSourceEventCheckCommand) {
    return this.useCase.completeCheck(context, command.payload);
  }
}
