import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";
import { createResourceNetworkProfileInputSchema } from "./create-resource.schema";

export const configureResourceNetworkCommandInputSchema = z.object({
  resourceId: nonEmptyTrimmedString("Resource id"),
  networkProfile: createResourceNetworkProfileInputSchema,
});

export type ConfigureResourceNetworkCommandInput = z.input<
  typeof configureResourceNetworkCommandInputSchema
>;
export type ConfigureResourceNetworkCommandPayload = z.output<
  typeof configureResourceNetworkCommandInputSchema
>;
