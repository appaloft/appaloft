import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type OrganizationInvitationSummary } from "../../ports";
import { tokens } from "../../tokens";
import { InviteOrganizationMemberCommand } from "./invite-organization-member.command";
import { type InviteOrganizationMemberUseCase } from "./invite-organization-member.use-case";

@CommandHandler(InviteOrganizationMemberCommand)
@injectable()
export class InviteOrganizationMemberCommandHandler
  implements CommandHandlerContract<InviteOrganizationMemberCommand, OrganizationInvitationSummary>
{
  constructor(
    @inject(tokens.inviteOrganizationMemberUseCase)
    private readonly useCase: InviteOrganizationMemberUseCase,
  ) {}

  handle(context: ExecutionContext, command: InviteOrganizationMemberCommand) {
    return this.useCase.execute(context, {
      organizationId: command.organizationId,
      email: command.email,
      role: command.role,
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
    });
  }
}
