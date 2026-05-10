import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type ConfirmActionPreviewRouteCommandInput,
  type ConfirmActionPreviewRouteResponse,
  confirmActionPreviewRouteCommandInputSchema,
} from "./confirm-action-preview-route.schema";

export {
  type ConfirmActionPreviewRouteCommandInput,
  type ConfirmActionPreviewRouteResponse,
  confirmActionPreviewRouteCommandInputSchema,
  confirmActionPreviewRouteResponseSchema,
} from "./confirm-action-preview-route.schema";

export class ConfirmActionPreviewRouteCommand extends Command<ConfirmActionPreviewRouteResponse> {
  constructor(
    public readonly deploymentId: string,
    public readonly host: string,
    public readonly pathPrefix: string,
    public readonly tlsMode: "auto" | "disabled",
  ) {
    super();
  }

  static create(
    input: ConfirmActionPreviewRouteCommandInput,
  ): Result<ConfirmActionPreviewRouteCommand> {
    return parseOperationInput(confirmActionPreviewRouteCommandInputSchema, input).map(
      (parsed) =>
        new ConfirmActionPreviewRouteCommand(
          parsed.deploymentId,
          parsed.host,
          parsed.pathPrefix,
          parsed.tlsMode,
        ),
    );
  }
}
