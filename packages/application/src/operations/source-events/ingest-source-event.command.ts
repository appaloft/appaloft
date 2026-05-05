import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type IngestSourceEventResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type IngestSourceEventCommandInput,
  type IngestSourceEventCommandPayload,
  ingestSourceEventCommandInputSchema,
} from "./ingest-source-event.schema";

export {
  type IngestSourceEventCommandInput,
  type IngestSourceEventCommandPayload,
  ingestSourceEventCommandInputSchema,
} from "./ingest-source-event.schema";

export class IngestSourceEventCommand extends Command<IngestSourceEventResult> {
  constructor(
    public readonly sourceKind: IngestSourceEventCommandPayload["sourceKind"],
    public readonly eventKind: IngestSourceEventCommandPayload["eventKind"],
    public readonly scopeResourceId: string | undefined,
    public readonly sourceIdentity: IngestSourceEventCommandPayload["sourceIdentity"],
    public readonly ref: string,
    public readonly revision: string,
    public readonly verification: IngestSourceEventCommandPayload["verification"],
    public readonly deliveryId?: string,
    public readonly idempotencyKey?: string,
    public readonly receivedAt?: string,
  ) {
    super();
  }

  static create(input: IngestSourceEventCommandInput): Result<IngestSourceEventCommand> {
    return parseOperationInput(ingestSourceEventCommandInputSchema, input).map(
      (parsed) =>
        new IngestSourceEventCommand(
          parsed.sourceKind,
          parsed.eventKind,
          trimToUndefined(parsed.scopeResourceId),
          parsed.sourceIdentity,
          parsed.ref,
          parsed.revision,
          parsed.verification,
          trimToUndefined(parsed.deliveryId),
          trimToUndefined(parsed.idempotencyKey),
          trimToUndefined(parsed.receivedAt),
        ),
    );
  }
}
