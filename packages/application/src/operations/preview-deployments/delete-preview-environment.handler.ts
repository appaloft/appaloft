import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { DeletePreviewEnvironmentCommand } from "./delete-preview-environment.command";
import {
  type CleanupPreviewEnvironmentResult,
  type PreviewEnvironmentCleanupService,
} from "./preview-cleanup.service";

@CommandHandler(DeletePreviewEnvironmentCommand)
@injectable()
export class DeletePreviewEnvironmentCommandHandler
  implements
    CommandHandlerContract<DeletePreviewEnvironmentCommand, CleanupPreviewEnvironmentResult>
{
  constructor(
    @inject(tokens.previewEnvironmentCleanupService)
    private readonly useCase: PreviewEnvironmentCleanupService,
  ) {}

  handle(context: ExecutionContext, command: DeletePreviewEnvironmentCommand) {
    return this.useCase.cleanup(context, {
      previewEnvironmentId: command.previewEnvironmentId,
      resourceId: command.resourceId,
    });
  }
}
