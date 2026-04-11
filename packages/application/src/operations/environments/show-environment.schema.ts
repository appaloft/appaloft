import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const showEnvironmentQueryInputSchema = z.object({
  environmentId: nonEmptyTrimmedString("Environment id"),
});

export type ShowEnvironmentQueryInput = z.input<typeof showEnvironmentQueryInputSchema>;
