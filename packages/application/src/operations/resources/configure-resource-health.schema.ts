import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";
import { resourceHealthCheckPolicyInputSchema } from "./create-resource.schema";

export const configureResourceHealthCommandInputSchema = z.object({
  resourceId: nonEmptyTrimmedString("Resource id"),
  healthCheck: resourceHealthCheckPolicyInputSchema,
});

export type ConfigureResourceHealthCommandInput = z.input<
  typeof configureResourceHealthCommandInputSchema
>;
export type ConfigureResourceHealthCommandPayload = z.output<
  typeof configureResourceHealthCommandInputSchema
>;
