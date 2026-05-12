import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type RuntimeTargetCapacityPruneResult } from "../../ports";
import { tokens } from "../../tokens";
import { PruneServerCapacityCommand } from "./prune-server-capacity.command";
import { type PruneServerCapacityUseCase } from "./prune-server-capacity.use-case";

@CommandHandler(PruneServerCapacityCommand)
@injectable()
export class PruneServerCapacityCommandHandler
  implements CommandHandlerContract<PruneServerCapacityCommand, RuntimeTargetCapacityPruneResult>
{
  constructor(
    @inject(tokens.pruneServerCapacityUseCase)
    private readonly useCase: PruneServerCapacityUseCase,
  ) {}

  handle(context: ExecutionContext, command: PruneServerCapacityCommand) {
    return this.useCase.execute(context, command.input);
  }
}
