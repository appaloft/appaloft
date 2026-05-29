import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  TransferOrganizationOwnerCommand,
  type TransferOrganizationOwnerResult,
} from "./transfer-organization-owner.command";
import { type TransferOrganizationOwnerUseCase } from "./transfer-organization-owner.use-case";

@CommandHandler(TransferOrganizationOwnerCommand)
@injectable()
export class TransferOrganizationOwnerCommandHandler
  implements
    CommandHandlerContract<TransferOrganizationOwnerCommand, TransferOrganizationOwnerResult>
{
  constructor(
    @inject(tokens.transferOrganizationOwnerUseCase)
    private readonly useCase: TransferOrganizationOwnerUseCase,
  ) {}

  handle(context: ExecutionContext, command: TransferOrganizationOwnerCommand) {
    return this.useCase.execute(context, {
      organizationId: command.organizationId,
      fromMemberId: command.fromMemberId,
      toMemberId: command.toMemberId,
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
    });
  }
}
