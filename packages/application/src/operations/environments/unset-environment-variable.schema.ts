import { z } from "zod";

import {
  environmentVariableExposureSchema,
  environmentVariableScopeSchema,
  nonEmptyTrimmedString,
} from "../shared-schema";

export const unsetEnvironmentVariableCommandInputSchema = z.object({
  environmentId: nonEmptyTrimmedString("Environment id"),
  key: nonEmptyTrimmedString("Environment variable key"),
  exposure: environmentVariableExposureSchema,
  scope: environmentVariableScopeSchema.optional(),
});

export type UnsetEnvironmentVariableCommandInput = z.input<
  typeof unsetEnvironmentVariableCommandInputSchema
>;
