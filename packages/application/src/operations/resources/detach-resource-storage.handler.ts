import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { DetachResourceStorageCommand } from "./detach-resource-storage.command";
import { type DetachResourceStorageUseCase } from "./detach-resource-storage.use-case";

@CommandHandler(DetachResourceStorageCommand)
@injectable()
export class DetachResourceStorageCommandHandler
  implements CommandHandlerContract<DetachResourceStorageCommand, { id: string }>
{
  constructor(
    @inject(tokens.detachResourceStorageUseCase)
    private readonly useCase: DetachResourceStorageUseCase,
  ) {}

  async handle(
    context: ExecutionContext,
    command: DetachResourceStorageCommand,
  ): Promise<Result<{ id: string }>> {
    return this.useCase.execute(context, {
      resourceId: command.resourceId,
      attachmentId: command.attachmentId,
    });
  }
}
