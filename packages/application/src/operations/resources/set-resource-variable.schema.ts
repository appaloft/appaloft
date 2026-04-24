import { z } from "zod";

import {
  environmentVariableExposureSchema,
  environmentVariableKindSchema,
  nonEmptyTrimmedString,
} from "../shared-schema";

export const setResourceVariableCommandInputSchema = z.object({
  resourceId: nonEmptyTrimmedString("resourceId"),
  key: nonEmptyTrimmedString("key"),
  value: z.string(),
  kind: environmentVariableKindSchema.default("plain-config"),
  exposure: environmentVariableExposureSchema,
  isSecret: z.boolean().optional(),
});

export type SetResourceVariableCommandInput = z.output<
  typeof setResourceVariableCommandInputSchema
>;
