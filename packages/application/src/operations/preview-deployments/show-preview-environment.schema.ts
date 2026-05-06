import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const showPreviewEnvironmentQueryInputSchema = z.object({
  previewEnvironmentId: nonEmptyTrimmedString("Preview environment id"),
  projectId: nonEmptyTrimmedString("Project id").optional(),
  resourceId: nonEmptyTrimmedString("Resource id").optional(),
});

export type ShowPreviewEnvironmentQueryInput = z.input<
  typeof showPreviewEnvironmentQueryInputSchema
>;
