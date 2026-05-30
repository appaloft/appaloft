import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { DeleteOrganizationCommand } from "./delete-organization.command";
import { type DeleteOrganizationUseCase } from "./delete-organization.use-case";

@CommandHandler(DeleteOrganizationCommand)
@injectable()
export class DeleteOrganizationCommandHandler
  implements
    CommandHandlerContract<DeleteOrganizationCommand, { organizationId: string; deletedAt: string }>
{
  constructor(
    @inject(tokens.deleteOrganizationUseCase)
    private readonly useCase: DeleteOrganizationUseCase,
  ) {}

  handle(context: ExecutionContext, command: DeleteOrganizationCommand) {
    return this.useCase.execute(context, {
      organizationId: command.organizationId,
      confirmation: command.confirmation,
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
    });
  }
}
