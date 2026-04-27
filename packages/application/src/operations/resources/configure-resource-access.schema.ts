import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";
import { resourceAccessProfileInputSchema } from "./create-resource.schema";

export const configureResourceAccessCommandInputSchema = z.object({
  resourceId: nonEmptyTrimmedString("Resource id"),
  accessProfile: resourceAccessProfileInputSchema,
});

export type ConfigureResourceAccessCommandInput = z.input<
  typeof configureResourceAccessCommandInputSchema
>;
export type ConfigureResourceAccessCommandPayload = z.output<
  typeof configureResourceAccessCommandInputSchema
>;
