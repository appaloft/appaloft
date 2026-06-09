import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type CreateStorageVolumeBackupResult } from "../../ports";
import { tokens } from "../../tokens";
import { CreateStorageVolumeBackupCommand } from "./create-storage-volume-backup.command";
import { type CreateStorageVolumeBackupUseCase } from "./create-storage-volume-backup.use-case";

@CommandHandler(CreateStorageVolumeBackupCommand)
@injectable()
export class CreateStorageVolumeBackupCommandHandler
  implements
    CommandHandlerContract<CreateStorageVolumeBackupCommand, CreateStorageVolumeBackupResult>
{
  constructor(
    @inject(tokens.createStorageVolumeBackupUseCase)
    private readonly useCase: CreateStorageVolumeBackupUseCase,
  ) {}

  async handle(
    context: ExecutionContext,
    command: CreateStorageVolumeBackupCommand,
  ): Promise<Result<CreateStorageVolumeBackupResult>> {
    return this.useCase.execute(context, { planRequest: command.planRequest });
  }
}
