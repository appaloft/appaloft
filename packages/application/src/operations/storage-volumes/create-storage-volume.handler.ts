import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { CreateStorageVolumeCommand } from "./create-storage-volume.command";
import { type CreateStorageVolumeUseCase } from "./create-storage-volume.use-case";

@CommandHandler(CreateStorageVolumeCommand)
@injectable()
export class CreateStorageVolumeCommandHandler
  implements CommandHandlerContract<CreateStorageVolumeCommand, { id: string }>
{
  constructor(
    @inject(tokens.createStorageVolumeUseCase)
    private readonly useCase: CreateStorageVolumeUseCase,
  ) {}

  async handle(
    context: ExecutionContext,
    command: CreateStorageVolumeCommand,
  ): Promise<Result<{ id: string }>> {
    return this.useCase.execute(context, {
      projectId: command.projectId,
      environmentId: command.environmentId,
      name: command.name,
      kind: command.kind,
      ...(command.description ? { description: command.description } : {}),
      ...(command.sourcePath ? { sourcePath: command.sourcePath } : {}),
      ...(command.backupRelationship ? { backupRelationship: command.backupRelationship } : {}),
    });
  }
}
