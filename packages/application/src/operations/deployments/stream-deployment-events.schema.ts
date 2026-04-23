import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

const booleanInput = (defaultValue: boolean) =>
  z
    .union([
      z.boolean(),
      z.literal("true").transform(() => true),
      z.literal("false").transform(() => false),
    ])
    .default(defaultValue);

const optionalBooleanInput = z.union([
  z.boolean(),
  z.literal("true").transform(() => true),
  z.literal("false").transform(() => false),
]);

export const streamDeploymentEventsQueryInputSchema = z.object({
  deploymentId: nonEmptyTrimmedString("Deployment id"),
  cursor: z.string().trim().min(1, "Cursor must not be empty").optional(),
  historyLimit: z.coerce.number().int().min(0).max(200).default(100),
  includeHistory: optionalBooleanInput.optional(),
  follow: booleanInput(false),
  untilTerminal: booleanInput(true),
});

export type StreamDeploymentEventsQueryInput = z.input<
  typeof streamDeploymentEventsQueryInputSchema
>;
export type StreamDeploymentEventsQueryParsedInput = z.output<
  typeof streamDeploymentEventsQueryInputSchema
>;
