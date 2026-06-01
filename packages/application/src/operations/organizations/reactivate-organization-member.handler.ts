import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  ReactivateOrganizationMemberCommand,
  type ReactivateOrganizationMemberResult,
} from "./reactivate-organization-member.command";
import { type ReactivateOrganizationMemberUseCase } from "./reactivate-organization-member.use-case";

@CommandHandler(ReactivateOrganizationMemberCommand)
@injectable()
export class ReactivateOrganizationMemberCommandHandler
  implements
    CommandHandlerContract<ReactivateOrganizationMemberCommand, ReactivateOrganizationMemberResult>
{
  constructor(
    @inject(tokens.reactivateOrganizationMemberUseCase)
    private readonly useCase: ReactivateOrganizationMemberUseCase,
  ) {}

  handle(context: ExecutionContext, command: ReactivateOrganizationMemberCommand) {
    return this.useCase.execute(context, {
      organizationId: command.organizationId,
      memberId: command.memberId,
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
    });
  }
}
