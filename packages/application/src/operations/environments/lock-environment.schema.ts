import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const lockEnvironmentCommandInputSchema = z.object({
  environmentId: nonEmptyTrimmedString("Environment id"),
  reason: nonEmptyTrimmedString("Lock reason").max(280).optional(),
});

export type LockEnvironmentCommandInput = z.input<typeof lockEnvironmentCommandInputSchema>;
export type LockEnvironmentCommandPayload = z.output<typeof lockEnvironmentCommandInputSchema>;
