import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type AuditEventLegalHoldResult } from "../../ports";
import { tokens } from "../../tokens";
import { ReleaseAuditEventLegalHoldCommand } from "./release-audit-event-legal-hold.command";
import { type ReleaseAuditEventLegalHoldUseCase } from "./release-audit-event-legal-hold.use-case";

@CommandHandler(ReleaseAuditEventLegalHoldCommand)
@injectable()
export class ReleaseAuditEventLegalHoldCommandHandler
  implements CommandHandlerContract<ReleaseAuditEventLegalHoldCommand, AuditEventLegalHoldResult>
{
  constructor(
    @inject(tokens.releaseAuditEventLegalHoldUseCase)
    private readonly useCase: ReleaseAuditEventLegalHoldUseCase,
  ) {}

  handle(context: ExecutionContext, command: ReleaseAuditEventLegalHoldCommand) {
    return this.useCase.execute(context, command);
  }
}
