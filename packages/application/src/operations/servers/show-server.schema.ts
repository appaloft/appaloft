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

export const showServerQueryInputSchema = z.object({
  serverId: nonEmptyTrimmedString("Server id"),
  includeRollups: booleanInput(true),
});

export type ShowServerQueryInput = z.input<typeof showServerQueryInputSchema>;
export type ShowServerQueryParsedInput = z.output<typeof showServerQueryInputSchema>;
