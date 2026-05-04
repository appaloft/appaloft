import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const detachResourceStorageCommandInputSchema = z.object({
  resourceId: nonEmptyTrimmedString("Resource id"),
  attachmentId: nonEmptyTrimmedString("Resource storage attachment id"),
});

export type DetachResourceStorageCommandInput = z.output<
  typeof detachResourceStorageCommandInputSchema
>;
