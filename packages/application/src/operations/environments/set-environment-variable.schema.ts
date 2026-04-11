import { z } from "zod";

import {
  environmentVariableExposureSchema,
  environmentVariableKindSchema,
  environmentVariableScopeSchema,
  nonEmptyTrimmedString,
} from "../shared-schema";

export const setEnvironmentVariableCommandInputSchema = z.object({
  environmentId: nonEmptyTrimmedString("Environment id"),
  key: nonEmptyTrimmedString("Environment variable key"),
  value: z.string(),
  kind: environmentVariableKindSchema,
  exposure: environmentVariableExposureSchema,
  scope: environmentVariableScopeSchema.optional(),
  isSecret: z.boolean().optional(),
});

export type SetEnvironmentVariableCommandInput = z.input<
  typeof setEnvironmentVariableCommandInputSchema
>;
