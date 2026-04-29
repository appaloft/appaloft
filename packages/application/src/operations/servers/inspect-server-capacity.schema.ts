import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const inspectServerCapacityQueryInputSchema = z.object({
  serverId: nonEmptyTrimmedString("Server id"),
});

export type InspectServerCapacityQueryInput = z.input<typeof inspectServerCapacityQueryInputSchema>;
