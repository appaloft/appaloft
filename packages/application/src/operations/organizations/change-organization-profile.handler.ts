import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type OrganizationProfileSummary } from "../../ports";
import { tokens } from "../../tokens";
import { ChangeOrganizationProfileCommand } from "./change-organization-profile.command";
import { type ChangeOrganizationProfileUseCase } from "./change-organization-profile.use-case";

@CommandHandler(ChangeOrganizationProfileCommand)
@injectable()
export class ChangeOrganizationProfileCommandHandler
  implements CommandHandlerContract<ChangeOrganizationProfileCommand, OrganizationProfileSummary>
{
  constructor(
    @inject(tokens.changeOrganizationProfileUseCase)
    private readonly useCase: ChangeOrganizationProfileUseCase,
  ) {}

  handle(context: ExecutionContext, command: ChangeOrganizationProfileCommand) {
    return this.useCase.execute(context, {
      organizationId: command.organizationId,
      ...(command.name !== undefined ? { name: command.name } : {}),
      ...(command.slug !== undefined ? { slug: command.slug } : {}),
      ...(command.logoUrl !== undefined ? { logoUrl: command.logoUrl } : {}),
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
    });
  }
}
