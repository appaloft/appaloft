import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const checkServerDeleteSafetyQueryInputSchema = z.object({
  serverId: nonEmptyTrimmedString("Server id"),
});

export type CheckServerDeleteSafetyQueryInput = z.input<
  typeof checkServerDeleteSafetyQueryInputSchema
>;
export type CheckServerDeleteSafetyQueryPayload = z.output<
  typeof checkServerDeleteSafetyQueryInputSchema
>;
