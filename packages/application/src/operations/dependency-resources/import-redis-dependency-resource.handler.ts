import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ImportRedisDependencyResourceCommand } from "./import-redis-dependency-resource.command";
import { type ImportRedisDependencyResourceUseCase } from "./import-redis-dependency-resource.use-case";

@CommandHandler(ImportRedisDependencyResourceCommand)
@injectable()
export class ImportRedisDependencyResourceCommandHandler
  implements CommandHandlerContract<ImportRedisDependencyResourceCommand, { id: string }>
{
  constructor(
    @inject(tokens.importRedisDependencyResourceUseCase)
    private readonly useCase: ImportRedisDependencyResourceUseCase,
  ) {}

  async handle(
    context: ExecutionContext,
    command: ImportRedisDependencyResourceCommand,
  ): Promise<Result<{ id: string }>> {
    return this.useCase.execute(context, {
      projectId: command.projectId,
      environmentId: command.environmentId,
      name: command.name,
      connectionUrl: command.connectionUrl,
      ...(command.secretRef ? { secretRef: command.secretRef } : {}),
      ...(command.connectionSecret ? { connectionSecret: command.connectionSecret } : {}),
      ...(command.description ? { description: command.description } : {}),
      ...(command.backupRelationship ? { backupRelationship: command.backupRelationship } : {}),
    });
  }
}
