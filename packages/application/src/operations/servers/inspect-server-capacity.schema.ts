import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const inspectServerCapacityQueryInputSchema = z.object({
  serverId: nonEmptyTrimmedString("Server id"),
  profile: z.enum(["full", "attribution", "placement"]).optional().default("full"),
});

export type InspectServerCapacityQueryInput = z.input<typeof inspectServerCapacityQueryInputSchema>;
