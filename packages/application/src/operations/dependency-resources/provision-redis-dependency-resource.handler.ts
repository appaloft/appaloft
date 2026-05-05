import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ProvisionRedisDependencyResourceCommand } from "./provision-redis-dependency-resource.command";
import { type ProvisionRedisDependencyResourceUseCase } from "./provision-redis-dependency-resource.use-case";

@CommandHandler(ProvisionRedisDependencyResourceCommand)
@injectable()
export class ProvisionRedisDependencyResourceCommandHandler
  implements CommandHandlerContract<ProvisionRedisDependencyResourceCommand, { id: string }>
{
  constructor(
    @inject(tokens.provisionRedisDependencyResourceUseCase)
    private readonly useCase: ProvisionRedisDependencyResourceUseCase,
  ) {}

  async handle(
    context: ExecutionContext,
    command: ProvisionRedisDependencyResourceCommand,
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
