import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { PruneOperatorWorkCommand } from "./prune-operator-work.command";
import {
  type PruneOperatorWorkResult,
  type PruneOperatorWorkUseCase,
} from "./prune-operator-work.use-case";

@CommandHandler(PruneOperatorWorkCommand)
@injectable()
export class PruneOperatorWorkCommandHandler
  implements CommandHandlerContract<PruneOperatorWorkCommand, PruneOperatorWorkResult>
{
  constructor(
    @inject(tokens.pruneOperatorWorkUseCase)
    private readonly useCase: PruneOperatorWorkUseCase,
  ) {}

  handle(context: ExecutionContext, command: PruneOperatorWorkCommand) {
    return this.useCase.execute(context, {
      before: command.before,
      ...(command.statuses ? { statuses: command.statuses } : {}),
      ...(command.dryRun !== undefined ? { dryRun: command.dryRun } : {}),
    });
  }
}
