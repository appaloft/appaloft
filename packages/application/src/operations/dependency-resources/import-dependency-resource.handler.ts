import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ImportDependencyResourceCommand } from "./import-dependency-resource.command";
import { type ImportDependencyResourceUseCase } from "./import-dependency-resource.use-case";

@CommandHandler(ImportDependencyResourceCommand)
@injectable()
export class ImportDependencyResourceCommandHandler
  implements CommandHandlerContract<ImportDependencyResourceCommand, { id: string }>
{
  constructor(
    @inject(tokens.importDependencyResourceUseCase)
    private readonly useCase: ImportDependencyResourceUseCase,
  ) {}

  async handle(
    context: ExecutionContext,
    command: ImportDependencyResourceCommand,
  ): Promise<Result<{ id: string }>> {
    return this.useCase.execute(context, {
      kind: command.kind,
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
