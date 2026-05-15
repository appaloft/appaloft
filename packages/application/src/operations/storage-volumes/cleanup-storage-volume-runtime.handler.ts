import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type StorageRuntimeCleanupResult } from "../../ports";
import { tokens } from "../../tokens";
import { CleanupStorageVolumeRuntimeCommand } from "./cleanup-storage-volume-runtime.command";
import { type CleanupStorageVolumeRuntimeUseCase } from "./cleanup-storage-volume-runtime.use-case";

@CommandHandler(CleanupStorageVolumeRuntimeCommand)
@injectable()
export class CleanupStorageVolumeRuntimeCommandHandler
  implements CommandHandlerContract<CleanupStorageVolumeRuntimeCommand, StorageRuntimeCleanupResult>
{
  constructor(
    @inject(tokens.cleanupStorageVolumeRuntimeUseCase)
    private readonly useCase: CleanupStorageVolumeRuntimeUseCase,
  ) {}

  async handle(
    context: ExecutionContext,
    command: CleanupStorageVolumeRuntimeCommand,
  ): Promise<Result<StorageRuntimeCleanupResult>> {
    return this.useCase.execute(context, command.input);
  }
}
