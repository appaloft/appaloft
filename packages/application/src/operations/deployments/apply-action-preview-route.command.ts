import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type ApplyActionPreviewRouteCommandInput,
  type ApplyActionPreviewRouteResponse,
  applyActionPreviewRouteCommandInputSchema,
} from "./apply-action-preview-route.schema";

export {
  type ApplyActionPreviewRouteCommandInput,
  type ApplyActionPreviewRouteResponse,
  applyActionPreviewRouteCommandInputSchema,
  applyActionPreviewRouteResponseSchema,
} from "./apply-action-preview-route.schema";

export class ApplyActionPreviewRouteCommand extends Command<ApplyActionPreviewRouteResponse> {
  constructor(
    public readonly sourceFingerprint: string,
    public readonly projectId: string,
    public readonly environmentId: string,
    public readonly resourceId: string,
    public readonly serverId: string | undefined,
    public readonly host: string,
    public readonly pathPrefix: string,
    public readonly tlsMode: "auto" | "disabled",
    public readonly destinationId?: string,
  ) {
    super();
  }

  static create(
    input: ApplyActionPreviewRouteCommandInput,
  ): Result<ApplyActionPreviewRouteCommand> {
    return parseOperationInput(applyActionPreviewRouteCommandInputSchema, input).map(
      (parsed) =>
        new ApplyActionPreviewRouteCommand(
          parsed.sourceFingerprint,
          parsed.projectId,
          parsed.environmentId,
          parsed.resourceId,
          parsed.serverId,
          parsed.host,
          parsed.pathPrefix,
          parsed.tlsMode,
          parsed.destinationId,
        ),
    );
  }
}
