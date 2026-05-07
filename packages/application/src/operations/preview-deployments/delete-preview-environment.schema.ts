import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const deletePreviewEnvironmentCommandInputSchema = z.object({
  previewEnvironmentId: nonEmptyTrimmedString("Preview environment id"),
  resourceId: nonEmptyTrimmedString("Resource id"),
});

export type DeletePreviewEnvironmentCommandInput = z.input<
  typeof deletePreviewEnvironmentCommandInputSchema
>;
