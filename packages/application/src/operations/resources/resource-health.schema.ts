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

export const resourceHealthQueryInputSchema = z.object({
  resourceId: nonEmptyTrimmedString("Resource id"),
  mode: z.enum(["cached", "live"]).default("cached"),
  includeChecks: booleanInput(true),
  includePublicAccessProbe: booleanInput(false),
  includeRuntimeProbe: booleanInput(false),
});

export type ResourceHealthQueryInput = z.input<typeof resourceHealthQueryInputSchema>;
export type ResourceHealthQueryParsedInput = z.output<typeof resourceHealthQueryInputSchema>;
