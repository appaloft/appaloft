import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { DeleteStorageVolumeCommand } from "./delete-storage-volume.command";
import { type DeleteStorageVolumeUseCase } from "./delete-storage-volume.use-case";

@CommandHandler(DeleteStorageVolumeCommand)
@injectable()
export class DeleteStorageVolumeCommandHandler
  implements CommandHandlerContract<DeleteStorageVolumeCommand, { id: string }>
{
  constructor(
    @inject(tokens.deleteStorageVolumeUseCase)
    private readonly useCase: DeleteStorageVolumeUseCase,
  ) {}

  async handle(
    context: ExecutionContext,
    command: DeleteStorageVolumeCommand,
  ): Promise<Result<{ id: string }>> {
    return this.useCase.execute(context, { storageVolumeId: command.storageVolumeId });
  }
}
