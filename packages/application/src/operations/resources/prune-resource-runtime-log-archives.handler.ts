import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ResourceRuntimeLogArchivePruneResult } from "../../ports";
import { tokens } from "../../tokens";
import { PruneResourceRuntimeLogArchivesCommand } from "./prune-resource-runtime-log-archives.command";
import { type PruneResourceRuntimeLogArchivesUseCase } from "./prune-resource-runtime-log-archives.use-case";

@CommandHandler(PruneResourceRuntimeLogArchivesCommand)
@injectable()
export class PruneResourceRuntimeLogArchivesCommandHandler
  implements
    CommandHandlerContract<
      PruneResourceRuntimeLogArchivesCommand,
      ResourceRuntimeLogArchivePruneResult
    >
{
  constructor(
    @inject(tokens.pruneResourceRuntimeLogArchivesUseCase)
    private readonly useCase: PruneResourceRuntimeLogArchivesUseCase,
  ) {}

  handle(context: ExecutionContext, command: PruneResourceRuntimeLogArchivesCommand) {
    return this.useCase.execute(context, command);
  }
}
