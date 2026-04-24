import { z } from "zod";

import { environmentVariableExposureSchema, nonEmptyTrimmedString } from "../shared-schema";

export const unsetResourceVariableCommandInputSchema = z.object({
  resourceId: nonEmptyTrimmedString("resourceId"),
  key: nonEmptyTrimmedString("key"),
  exposure: environmentVariableExposureSchema,
});

export type UnsetResourceVariableCommandInput = z.output<
  typeof unsetResourceVariableCommandInputSchema
>;
