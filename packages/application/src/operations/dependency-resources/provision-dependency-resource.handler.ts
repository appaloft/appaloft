import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ProvisionDependencyResourceCommand } from "./provision-dependency-resource.command";
import { type ProvisionDependencyResourceUseCase } from "./provision-dependency-resource.use-case";

@CommandHandler(ProvisionDependencyResourceCommand)
@injectable()
export class ProvisionDependencyResourceCommandHandler
  implements CommandHandlerContract<ProvisionDependencyResourceCommand, { id: string }>
{
  constructor(
    @inject(tokens.provisionDependencyResourceUseCase)
    private readonly useCase: ProvisionDependencyResourceUseCase,
  ) {}

  async handle(
    context: ExecutionContext,
    command: ProvisionDependencyResourceCommand,
  ): Promise<Result<{ id: string }>> {
    return this.useCase.execute(context, {
      kind: command.kind,
      projectId: command.projectId,
      environmentId: command.environmentId,
      ...(command.serverId ? { serverId: command.serverId } : {}),
      name: command.name,
      ...(command.providerKey ? { providerKey: command.providerKey } : {}),
      ...(command.description ? { description: command.description } : {}),
      ...(command.backupRelationship ? { backupRelationship: command.backupRelationship } : {}),
    });
  }
}
