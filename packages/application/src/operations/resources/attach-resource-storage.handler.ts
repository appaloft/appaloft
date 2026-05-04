import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { AttachResourceStorageCommand } from "./attach-resource-storage.command";
import { type AttachResourceStorageUseCase } from "./attach-resource-storage.use-case";

@CommandHandler(AttachResourceStorageCommand)
@injectable()
export class AttachResourceStorageCommandHandler
  implements CommandHandlerContract<AttachResourceStorageCommand, { id: string }>
{
  constructor(
    @inject(tokens.attachResourceStorageUseCase)
    private readonly useCase: AttachResourceStorageUseCase,
  ) {}

  async handle(
    context: ExecutionContext,
    command: AttachResourceStorageCommand,
  ): Promise<Result<{ id: string }>> {
    return this.useCase.execute(context, {
      resourceId: command.resourceId,
      storageVolumeId: command.storageVolumeId,
      destinationPath: command.destinationPath,
      mountMode: command.mountMode,
    });
  }
}
