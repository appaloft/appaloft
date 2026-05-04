import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ProvisionPostgresDependencyResourceCommand } from "./provision-postgres-dependency-resource.command";
import { type ProvisionPostgresDependencyResourceUseCase } from "./provision-postgres-dependency-resource.use-case";

@CommandHandler(ProvisionPostgresDependencyResourceCommand)
@injectable()
export class ProvisionPostgresDependencyResourceCommandHandler
  implements CommandHandlerContract<ProvisionPostgresDependencyResourceCommand, { id: string }>
{
  constructor(
    @inject(tokens.provisionPostgresDependencyResourceUseCase)
    private readonly useCase: ProvisionPostgresDependencyResourceUseCase,
  ) {}

  async handle(
    context: ExecutionContext,
    command: ProvisionPostgresDependencyResourceCommand,
  ): Promise<Result<{ id: string }>> {
    return this.useCase.execute(context, {
      projectId: command.projectId,
      environmentId: command.environmentId,
      name: command.name,
      ...(command.providerKey ? { providerKey: command.providerKey } : {}),
      ...(command.description ? { description: command.description } : {}),
      ...(command.backupRelationship ? { backupRelationship: command.backupRelationship } : {}),
    });
  }
}
