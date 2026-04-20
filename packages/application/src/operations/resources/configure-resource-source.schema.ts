import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";
import { createResourceSourceBindingInputSchema } from "./create-resource.schema";

export const configureResourceSourceCommandInputSchema = z.object({
  resourceId: nonEmptyTrimmedString("Resource id"),
  source: createResourceSourceBindingInputSchema,
  idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
});

export type ConfigureResourceSourceCommandInput = z.input<
  typeof configureResourceSourceCommandInputSchema
>;
export type ConfigureResourceSourceCommandPayload = z.output<
  typeof configureResourceSourceCommandInputSchema
>;
