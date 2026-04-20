import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";
import { configureResourceRuntimeProfileInputSchema } from "./create-resource.schema";

export const configureResourceRuntimeCommandInputSchema = z.object({
  resourceId: nonEmptyTrimmedString("Resource id"),
  runtimeProfile: configureResourceRuntimeProfileInputSchema,
  idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
});

export type ConfigureResourceRuntimeCommandInput = z.input<
  typeof configureResourceRuntimeCommandInputSchema
>;
export type ConfigureResourceRuntimeCommandPayload = z.output<
  typeof configureResourceRuntimeCommandInputSchema
>;
