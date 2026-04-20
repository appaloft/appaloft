import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ArchiveResourceCommand } from "./archive-resource.command";
import { type ArchiveResourceUseCase } from "./archive-resource.use-case";

@CommandHandler(ArchiveResourceCommand)
@injectable()
export class ArchiveResourceCommandHandler
  implements CommandHandlerContract<ArchiveResourceCommand, { id: string }>
{
  constructor(
    @inject(tokens.archiveResourceUseCase)
    private readonly useCase: ArchiveResourceUseCase,
  ) {}

  handle(context: ExecutionContext, command: ArchiveResourceCommand) {
    return this.useCase.execute(context, {
      resourceId: command.resourceId,
      ...(command.reason ? { reason: command.reason } : {}),
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
    });
  }
}
