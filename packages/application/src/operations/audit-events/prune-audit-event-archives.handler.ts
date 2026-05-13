import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type AuditEventArchivePruneResult } from "../../ports";
import { tokens } from "../../tokens";
import { PruneAuditEventArchivesCommand } from "./prune-audit-event-archives.command";
import { type PruneAuditEventArchivesUseCase } from "./prune-audit-event-archives.use-case";

@CommandHandler(PruneAuditEventArchivesCommand)
@injectable()
export class PruneAuditEventArchivesCommandHandler
  implements CommandHandlerContract<PruneAuditEventArchivesCommand, AuditEventArchivePruneResult>
{
  constructor(
    @inject(tokens.pruneAuditEventArchivesUseCase)
    private readonly useCase: PruneAuditEventArchivesUseCase,
  ) {}

  handle(context: ExecutionContext, command: PruneAuditEventArchivesCommand) {
    return this.useCase.execute(context, command);
  }
}
