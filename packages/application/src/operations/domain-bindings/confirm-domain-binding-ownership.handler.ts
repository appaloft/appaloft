import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ConfirmDomainBindingOwnershipCommand } from "./confirm-domain-binding-ownership.command";
import { type ConfirmDomainBindingOwnershipUseCase } from "./confirm-domain-binding-ownership.use-case";

@CommandHandler(ConfirmDomainBindingOwnershipCommand)
@injectable()
export class ConfirmDomainBindingOwnershipCommandHandler
  implements
    CommandHandlerContract<
      ConfirmDomainBindingOwnershipCommand,
      { id: string; verificationAttemptId: string }
    >
{
  constructor(
    @inject(tokens.confirmDomainBindingOwnershipUseCase)
    private readonly useCase: ConfirmDomainBindingOwnershipUseCase,
  ) {}

  handle(context: ExecutionContext, command: ConfirmDomainBindingOwnershipCommand) {
    return this.useCase.execute(context, {
      domainBindingId: command.domainBindingId,
      ...(command.verificationAttemptId
        ? { verificationAttemptId: command.verificationAttemptId }
        : {}),
      ...(command.verificationMode ? { verificationMode: command.verificationMode } : {}),
      ...(command.confirmedBy ? { confirmedBy: command.confirmedBy } : {}),
      ...(command.evidence ? { evidence: command.evidence } : {}),
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
    });
  }
}
