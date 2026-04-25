import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const environmentEffectivePrecedenceQueryInputSchema = z.object({
  environmentId: nonEmptyTrimmedString("Environment id"),
});

export type EnvironmentEffectivePrecedenceQueryInput = z.input<
  typeof environmentEffectivePrecedenceQueryInputSchema
>;
