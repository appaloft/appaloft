import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type OrganizationMemberSummary } from "../../ports";
import { tokens } from "../../tokens";
import { UpdateOrganizationMemberRoleCommand } from "./update-organization-member-role.command";
import { type UpdateOrganizationMemberRoleUseCase } from "./update-organization-member-role.use-case";

@CommandHandler(UpdateOrganizationMemberRoleCommand)
@injectable()
export class UpdateOrganizationMemberRoleCommandHandler
  implements CommandHandlerContract<UpdateOrganizationMemberRoleCommand, OrganizationMemberSummary>
{
  constructor(
    @inject(tokens.updateOrganizationMemberRoleUseCase)
    private readonly useCase: UpdateOrganizationMemberRoleUseCase,
  ) {}

  handle(context: ExecutionContext, command: UpdateOrganizationMemberRoleCommand) {
    return this.useCase.execute(context, {
      organizationId: command.organizationId,
      memberId: command.memberId,
      role: command.role,
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
    });
  }
}
