import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { IngestPreviewPullRequestEventCommand } from "./ingest-preview-pull-request-event.command";
import {
  type PreviewPullRequestEventIngestResult,
  type PreviewPullRequestEventIngestService,
} from "./preview-pull-request-event-ingest.service";

@CommandHandler(IngestPreviewPullRequestEventCommand)
@injectable()
export class IngestPreviewPullRequestEventCommandHandler
  implements
    CommandHandlerContract<
      IngestPreviewPullRequestEventCommand,
      PreviewPullRequestEventIngestResult
    >
{
  constructor(
    @inject(tokens.previewPullRequestEventIngestService)
    private readonly useCase: PreviewPullRequestEventIngestService,
  ) {}

  handle(context: ExecutionContext, command: IngestPreviewPullRequestEventCommand) {
    return this.useCase.ingest(context, {
      sourceEventId: command.sourceEventId,
      event: {
        provider: command.event.provider,
        eventKind: command.event.eventKind,
        eventAction: command.event.eventAction,
        repositoryFullName: command.event.repositoryFullName,
        ...(command.event.providerRepositoryId
          ? { providerRepositoryId: command.event.providerRepositoryId }
          : {}),
        ...(command.event.installationId ? { installationId: command.event.installationId } : {}),
        headRepositoryFullName: command.event.headRepositoryFullName,
        pullRequestNumber: command.event.pullRequestNumber,
        headSha: command.event.headSha,
        baseRef: command.event.baseRef,
        verified: command.event.verified,
        ...(command.event.deliveryId ? { deliveryId: command.event.deliveryId } : {}),
        ...(command.event.receivedAt ? { receivedAt: command.event.receivedAt } : {}),
      },
      projectId: command.projectId,
      environmentId: command.environmentId,
      resourceId: command.resourceId,
      serverId: command.serverId,
      destinationId: command.destinationId,
      sourceBindingFingerprint: command.sourceBindingFingerprint,
    });
  }
}
