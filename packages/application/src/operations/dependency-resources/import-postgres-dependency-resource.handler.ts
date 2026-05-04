import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ImportPostgresDependencyResourceCommand } from "./import-postgres-dependency-resource.command";
import { type ImportPostgresDependencyResourceUseCase } from "./import-postgres-dependency-resource.use-case";

@CommandHandler(ImportPostgresDependencyResourceCommand)
@injectable()
export class ImportPostgresDependencyResourceCommandHandler
  implements CommandHandlerContract<ImportPostgresDependencyResourceCommand, { id: string }>
{
  constructor(
    @inject(tokens.importPostgresDependencyResourceUseCase)
    private readonly useCase: ImportPostgresDependencyResourceUseCase,
  ) {}

  async handle(
    context: ExecutionContext,
    command: ImportPostgresDependencyResourceCommand,
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
