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

export const streamOperatorWorkEventsQueryInputSchema = z.object({
  workId: nonEmptyTrimmedString("Work id"),
  cursor: z.string().trim().min(1, "Cursor must not be empty").optional(),
  historyLimit: z.coerce.number().int().min(0).max(200).default(100),
  includeHistory: optionalBooleanInput.optional(),
  follow: booleanInput(false),
  untilTerminal: booleanInput(true),
  pollIntervalMs: z.coerce.number().int().min(50).max(30_000).default(1_000),
});

export type StreamOperatorWorkEventsQueryInput = z.input<
  typeof streamOperatorWorkEventsQueryInputSchema
>;
export type StreamOperatorWorkEventsQueryParsedInput = z.output<
  typeof streamOperatorWorkEventsQueryInputSchema
>;
