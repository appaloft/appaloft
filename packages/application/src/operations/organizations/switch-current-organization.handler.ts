import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type CurrentOrganizationContext } from "../../ports";
import { tokens } from "../../tokens";
import { SwitchCurrentOrganizationCommand } from "./switch-current-organization.command";
import { type SwitchCurrentOrganizationUseCase } from "./switch-current-organization.use-case";

@CommandHandler(SwitchCurrentOrganizationCommand)
@injectable()
export class SwitchCurrentOrganizationCommandHandler
  implements CommandHandlerContract<SwitchCurrentOrganizationCommand, CurrentOrganizationContext>
{
  constructor(
    @inject(tokens.switchCurrentOrganizationUseCase)
    private readonly useCase: SwitchCurrentOrganizationUseCase,
  ) {}

  handle(context: ExecutionContext, command: SwitchCurrentOrganizationCommand) {
    return this.useCase.execute(context, {
      organizationId: command.organizationId,
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
    });
  }
}
