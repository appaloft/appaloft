import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  RemoveOrganizationMemberCommand,
  type RemoveOrganizationMemberResult,
} from "./remove-organization-member.command";
import { type RemoveOrganizationMemberUseCase } from "./remove-organization-member.use-case";

@CommandHandler(RemoveOrganizationMemberCommand)
@injectable()
export class RemoveOrganizationMemberCommandHandler
  implements CommandHandlerContract<RemoveOrganizationMemberCommand, RemoveOrganizationMemberResult>
{
  constructor(
    @inject(tokens.removeOrganizationMemberUseCase)
    private readonly useCase: RemoveOrganizationMemberUseCase,
  ) {}

  handle(context: ExecutionContext, command: RemoveOrganizationMemberCommand) {
    return this.useCase.execute(context, {
      organizationId: command.organizationId,
      memberId: command.memberId,
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
    });
  }
}
