import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  IssueOrRenewCertificateCommand,
  type IssueOrRenewCertificateCommandResult,
} from "./issue-or-renew-certificate.command";
import { type IssueOrRenewCertificateUseCase } from "./issue-or-renew-certificate.use-case";

@CommandHandler(IssueOrRenewCertificateCommand)
@injectable()
export class IssueOrRenewCertificateCommandHandler
  implements
    CommandHandlerContract<IssueOrRenewCertificateCommand, IssueOrRenewCertificateCommandResult>
{
  constructor(
    @inject(tokens.issueOrRenewCertificateUseCase)
    private readonly useCase: IssueOrRenewCertificateUseCase,
  ) {}

  handle(context: ExecutionContext, command: IssueOrRenewCertificateCommand) {
    return this.useCase.execute(context, {
      domainBindingId: command.domainBindingId,
      reason: command.reason,
      ...(command.certificateId ? { certificateId: command.certificateId } : {}),
      ...(command.providerKey ? { providerKey: command.providerKey } : {}),
      ...(command.challengeType ? { challengeType: command.challengeType } : {}),
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
      ...(command.causationId ? { causationId: command.causationId } : {}),
    });
  }
}
