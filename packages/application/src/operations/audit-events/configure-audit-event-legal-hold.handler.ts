import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type AuditEventLegalHoldResult } from "../../ports";
import { tokens } from "../../tokens";
import { ConfigureAuditEventLegalHoldCommand } from "./configure-audit-event-legal-hold.command";
import { type ConfigureAuditEventLegalHoldUseCase } from "./configure-audit-event-legal-hold.use-case";

@CommandHandler(ConfigureAuditEventLegalHoldCommand)
@injectable()
export class ConfigureAuditEventLegalHoldCommandHandler
  implements CommandHandlerContract<ConfigureAuditEventLegalHoldCommand, AuditEventLegalHoldResult>
{
  constructor(
    @inject(tokens.configureAuditEventLegalHoldUseCase)
    private readonly useCase: ConfigureAuditEventLegalHoldUseCase,
  ) {}

  handle(context: ExecutionContext, command: ConfigureAuditEventLegalHoldCommand) {
    return this.useCase.execute(context, command);
  }
}
