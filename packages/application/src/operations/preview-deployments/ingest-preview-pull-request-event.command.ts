import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type IngestPreviewPullRequestEventCommandInput,
  type IngestPreviewPullRequestEventCommandPayload,
  ingestPreviewPullRequestEventCommandInputSchema,
} from "./ingest-preview-pull-request-event.schema";
import { type PreviewPullRequestEventIngestResult } from "./preview-pull-request-event-ingest.service";

export {
  type IngestPreviewPullRequestEventCommandInput,
  type IngestPreviewPullRequestEventCommandPayload,
  ingestPreviewPullRequestEventCommandInputSchema,
} from "./ingest-preview-pull-request-event.schema";

export class IngestPreviewPullRequestEventCommand extends Command<PreviewPullRequestEventIngestResult> {
  constructor(
    public readonly sourceEventId: string,
    public readonly event: IngestPreviewPullRequestEventCommandPayload["event"],
    public readonly projectId: string,
    public readonly environmentId: string,
    public readonly resourceId: string,
    public readonly serverId: string,
    public readonly destinationId: string,
    public readonly sourceBindingFingerprint: string,
  ) {
    super();
  }

  static create(
    input: IngestPreviewPullRequestEventCommandInput,
  ): Result<IngestPreviewPullRequestEventCommand> {
    return parseOperationInput(ingestPreviewPullRequestEventCommandInputSchema, input).map(
      (parsed) =>
        new IngestPreviewPullRequestEventCommand(
          parsed.sourceEventId,
          parsed.event,
          parsed.projectId,
          parsed.environmentId,
          parsed.resourceId,
          parsed.serverId,
          parsed.destinationId,
          parsed.sourceBindingFingerprint,
        ),
    );
  }
}
