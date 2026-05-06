import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type DeletePreviewEnvironmentCommandInput,
  deletePreviewEnvironmentCommandInputSchema,
} from "./delete-preview-environment.schema";
import { type CleanupPreviewEnvironmentResult } from "./preview-cleanup.service";

export {
  type DeletePreviewEnvironmentCommandInput,
  deletePreviewEnvironmentCommandInputSchema,
} from "./delete-preview-environment.schema";

export class DeletePreviewEnvironmentCommand extends Command<CleanupPreviewEnvironmentResult> {
  constructor(
    public readonly previewEnvironmentId: string,
    public readonly resourceId: string,
  ) {
    super();
  }

  static create(
    input: DeletePreviewEnvironmentCommandInput,
  ): Result<DeletePreviewEnvironmentCommand> {
    return parseOperationInput(deletePreviewEnvironmentCommandInputSchema, input).map(
      (parsed) =>
        new DeletePreviewEnvironmentCommand(parsed.previewEnvironmentId, parsed.resourceId),
    );
  }
}
