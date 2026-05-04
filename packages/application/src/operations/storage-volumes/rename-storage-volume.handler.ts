import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { RenameStorageVolumeCommand } from "./rename-storage-volume.command";
import { type RenameStorageVolumeUseCase } from "./rename-storage-volume.use-case";

@CommandHandler(RenameStorageVolumeCommand)
@injectable()
export class RenameStorageVolumeCommandHandler
  implements CommandHandlerContract<RenameStorageVolumeCommand, { id: string }>
{
  constructor(
    @inject(tokens.renameStorageVolumeUseCase)
    private readonly useCase: RenameStorageVolumeUseCase,
  ) {}

  async handle(
    context: ExecutionContext,
    command: RenameStorageVolumeCommand,
  ): Promise<Result<{ id: string }>> {
    return this.useCase.execute(context, {
      storageVolumeId: command.storageVolumeId,
      name: command.name,
    });
  }
}
