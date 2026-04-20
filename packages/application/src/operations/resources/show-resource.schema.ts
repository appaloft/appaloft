import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

const booleanInput = (defaultValue: boolean) =>
  z
    .union([
      z.boolean(),
      z.literal("true").transform(() => true),
      z.literal("false").transform(() => false),
    ])
    .default(defaultValue);

export const showResourceQueryInputSchema = z.object({
  resourceId: nonEmptyTrimmedString("Resource id"),
  includeLatestDeployment: booleanInput(true),
  includeAccessSummary: booleanInput(true),
  includeProfileDiagnostics: booleanInput(false),
});

export type ShowResourceQueryInput = z.input<typeof showResourceQueryInputSchema>;
export type ShowResourceQueryParsedInput = z.output<typeof showResourceQueryInputSchema>;
