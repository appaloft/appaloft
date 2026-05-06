import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Command } from "../../cqrs";
import { nonEmptyTrimmedString, parseOperationInput } from "../shared-schema";
import { type CleanupPreviewEnvironmentResult } from "./preview-cleanup.service";

export const deletePreviewEnvironmentCommandInputSchema = z.object({
  previewEnvironmentId: nonEmptyTrimmedString("Preview environment id"),
  resourceId: nonEmptyTrimmedString("Resource id"),
});

export type DeletePreviewEnvironmentCommandInput = z.input<
  typeof deletePreviewEnvironmentCommandInputSchema
>;

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
