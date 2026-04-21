import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { CleanupPreviewCommand } from "./cleanup-preview.command";
import { type CleanupPreviewUseCase } from "./cleanup-preview.use-case";

@CommandHandler(CleanupPreviewCommand)
@injectable()
export class CleanupPreviewCommandHandler
  implements
    CommandHandlerContract<
      CleanupPreviewCommand,
      {
        sourceFingerprint: string;
        status: "cleaned" | "already-clean";
        cleanedRuntime: boolean;
        removedServerAppliedRoute: boolean;
        removedSourceLink: boolean;
        projectId?: string;
        environmentId?: string;
        resourceId?: string;
        serverId?: string;
        destinationId?: string;
        deploymentId?: string;
      }
    >
{
  constructor(
    @inject(tokens.cleanupPreviewUseCase)
    private readonly useCase: CleanupPreviewUseCase,
  ) {}

  handle(context: ExecutionContext, command: CleanupPreviewCommand) {
    return this.useCase.execute(context, {
      sourceFingerprint: command.sourceFingerprint,
    });
  }
}
