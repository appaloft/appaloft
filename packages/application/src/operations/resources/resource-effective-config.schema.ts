import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const resourceEffectiveConfigQueryInputSchema = z
  .object({
    resourceId: nonEmptyTrimmedString("resourceId").optional(),
    previewEnvironmentId: nonEmptyTrimmedString("previewEnvironmentId").optional(),
  })
  .superRefine((input, context) => {
    if (input.resourceId || input.previewEnvironmentId) {
      return;
    }

    context.addIssue({
      code: "custom",
      message: "Either resourceId or previewEnvironmentId is required",
      path: ["resourceId"],
    });
  });

export type ResourceEffectiveConfigQueryInput = z.output<
  typeof resourceEffectiveConfigQueryInputSchema
>;
