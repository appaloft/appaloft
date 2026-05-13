import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type AuditEventPruneResult } from "../../ports";
import { tokens } from "../../tokens";
import { PruneAuditEventsCommand } from "./prune-audit-events.command";
import { type PruneAuditEventsUseCase } from "./prune-audit-events.use-case";

@CommandHandler(PruneAuditEventsCommand)
@injectable()
export class PruneAuditEventsCommandHandler
  implements CommandHandlerContract<PruneAuditEventsCommand, AuditEventPruneResult>
{
  constructor(
    @inject(tokens.pruneAuditEventsUseCase)
    private readonly useCase: PruneAuditEventsUseCase,
  ) {}

  handle(context: ExecutionContext, command: PruneAuditEventsCommand) {
    return this.useCase.execute(context, command);
  }
}
