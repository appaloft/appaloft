import { type Result } from "@appaloft/core";
import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type RelinkSourceLinkCommandInput,
  type RelinkSourceLinkCommandPayload,
  relinkSourceLinkCommandInputSchema,
} from "./relink-source-link.schema";

export {
  type RelinkSourceLinkCommandInput,
  relinkSourceLinkCommandInputSchema,
} from "./relink-source-link.schema";

export class RelinkSourceLinkCommand extends Command<{
  sourceFingerprint: string;
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId?: string;
  destinationId?: string;
}> {
  constructor(
    public readonly sourceFingerprint: string,
    public readonly projectId: string,
    public readonly environmentId: string,
    public readonly resourceId: string,
    public readonly serverId?: string,
    public readonly destinationId?: string,
    public readonly expectedCurrentProjectId?: string,
    public readonly expectedCurrentEnvironmentId?: string,
    public readonly expectedCurrentResourceId?: string,
    public readonly reason?: string,
  ) {
    super();
  }

  static create(input: RelinkSourceLinkCommandInput): Result<RelinkSourceLinkCommand> {
    return parseOperationInput(relinkSourceLinkCommandInputSchema, input).map(
      (parsed: RelinkSourceLinkCommandPayload) =>
        new RelinkSourceLinkCommand(
          parsed.sourceFingerprint,
          parsed.projectId,
          parsed.environmentId,
          parsed.resourceId,
          parsed.serverId,
          parsed.destinationId,
          parsed.expectedCurrentProjectId,
          parsed.expectedCurrentEnvironmentId,
          parsed.expectedCurrentResourceId,
          parsed.reason,
        ),
    );
  }
}
