import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const redeployResourceCommandInputSchema = z.object({
  resourceId: nonEmptyTrimmedString("Resource id"),
  force: z.boolean().optional(),
});

export type RedeployResourceCommandInput = z.input<typeof redeployResourceCommandInputSchema>;
