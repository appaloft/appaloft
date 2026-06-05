import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ResourceRuntimeControlAttemptPruneResult } from "../../ports";
import { tokens } from "../../tokens";
import { PruneResourceRuntimeControlAttemptsCommand } from "./prune-resource-runtime-control-attempts.command";
import { type PruneResourceRuntimeControlAttemptsUseCase } from "./prune-resource-runtime-control-attempts.use-case";

@CommandHandler(PruneResourceRuntimeControlAttemptsCommand)
@injectable()
export class PruneResourceRuntimeControlAttemptsCommandHandler
  implements
    CommandHandlerContract<
      PruneResourceRuntimeControlAttemptsCommand,
      ResourceRuntimeControlAttemptPruneResult
    >
{
  constructor(
    @inject(tokens.pruneResourceRuntimeControlAttemptsUseCase)
    private readonly useCase: PruneResourceRuntimeControlAttemptsUseCase,
  ) {}

  handle(context: ExecutionContext, command: PruneResourceRuntimeControlAttemptsCommand) {
    return this.useCase.execute(context, command);
  }
}
