import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";
import {
  createResourceSourceBindingInputSchema,
  localFolderResourceSourceBindingExample,
} from "./create-resource.schema";

const configureResourceSourceCommandInputBaseSchema = z.object({
  resourceId: nonEmptyTrimmedString("Resource id"),
  source: createResourceSourceBindingInputSchema,
  idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
});

export const configureResourceSourceCommandInputExample = {
  resourceId: "res_web_console",
  source: localFolderResourceSourceBindingExample,
  idempotencyKey: "configure-source-res-web-console",
} satisfies z.input<typeof configureResourceSourceCommandInputBaseSchema>;

export const configureResourceSourceCommandInputSchema =
  configureResourceSourceCommandInputBaseSchema.meta({
    examples: [configureResourceSourceCommandInputExample],
  });

export type ConfigureResourceSourceCommandInput = z.input<
  typeof configureResourceSourceCommandInputSchema
>;
export type ConfigureResourceSourceCommandPayload = z.output<
  typeof configureResourceSourceCommandInputSchema
>;
