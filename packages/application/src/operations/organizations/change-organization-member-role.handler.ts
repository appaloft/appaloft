import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type OrganizationMemberSummary } from "../../ports";
import { tokens } from "../../tokens";
import { ChangeOrganizationMemberRoleCommand } from "./change-organization-member-role.command";
import { type ChangeOrganizationMemberRoleUseCase } from "./change-organization-member-role.use-case";

@CommandHandler(ChangeOrganizationMemberRoleCommand)
@injectable()
export class ChangeOrganizationMemberRoleCommandHandler
  implements CommandHandlerContract<ChangeOrganizationMemberRoleCommand, OrganizationMemberSummary>
{
  constructor(
    @inject(tokens.changeOrganizationMemberRoleUseCase)
    private readonly useCase: ChangeOrganizationMemberRoleUseCase,
  ) {}

  handle(context: ExecutionContext, command: ChangeOrganizationMemberRoleCommand) {
    return this.useCase.execute(context, {
      organizationId: command.organizationId,
      memberId: command.memberId,
      role: command.role,
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
    });
  }
}
