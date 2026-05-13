import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ResourceRuntimeLogArchiveResult } from "../../ports";
import { tokens } from "../../tokens";
import { ArchiveResourceRuntimeLogsCommand } from "./archive-resource-runtime-logs.command";
import { type ArchiveResourceRuntimeLogsUseCase } from "./archive-resource-runtime-logs.use-case";

@CommandHandler(ArchiveResourceRuntimeLogsCommand)
@injectable()
export class ArchiveResourceRuntimeLogsCommandHandler
  implements
    CommandHandlerContract<ArchiveResourceRuntimeLogsCommand, ResourceRuntimeLogArchiveResult>
{
  constructor(
    @inject(tokens.archiveResourceRuntimeLogsUseCase)
    private readonly useCase: ArchiveResourceRuntimeLogsUseCase,
  ) {}

  handle(context: ExecutionContext, command: ArchiveResourceRuntimeLogsCommand) {
    return this.useCase.execute(context, command);
  }
}
