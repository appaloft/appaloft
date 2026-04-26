import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const unlockEnvironmentCommandInputSchema = z.object({
  environmentId: nonEmptyTrimmedString("Environment id"),
});

export type UnlockEnvironmentCommandInput = z.input<typeof unlockEnvironmentCommandInputSchema>;
