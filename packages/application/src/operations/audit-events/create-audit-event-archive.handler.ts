import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type AuditEventArchiveResult } from "../../ports";
import { tokens } from "../../tokens";
import { CreateAuditEventArchiveCommand } from "./create-audit-event-archive.command";
import { type CreateAuditEventArchiveUseCase } from "./create-audit-event-archive.use-case";

@CommandHandler(CreateAuditEventArchiveCommand)
@injectable()
export class CreateAuditEventArchiveCommandHandler
  implements CommandHandlerContract<CreateAuditEventArchiveCommand, AuditEventArchiveResult>
{
  constructor(
    @inject(tokens.createAuditEventArchiveUseCase)
    private readonly useCase: CreateAuditEventArchiveUseCase,
  ) {}

  handle(context: ExecutionContext, command: CreateAuditEventArchiveCommand) {
    return this.useCase.execute(context, command);
  }
}
