import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  RecordUsageIntentCommand,
  type RecordUsageIntentResponse,
} from "./record-usage-intent.command";
import { type RecordUsageIntentUseCase } from "./record-usage-intent.use-case";

@CommandHandler(RecordUsageIntentCommand)
@injectable()
export class RecordUsageIntentCommandHandler
  implements CommandHandlerContract<RecordUsageIntentCommand, RecordUsageIntentResponse>
{
  constructor(
    @inject(tokens.recordUsageIntentUseCase)
    private readonly useCase: RecordUsageIntentUseCase,
  ) {}

  async handle(context: ExecutionContext, command: RecordUsageIntentCommand) {
    return this.useCase.execute(context, command);
  }
}
