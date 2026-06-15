import { z } from "zod";

import { booleanQueryParamSchema, nonEmptyTrimmedString } from "../shared-schema";

export const deploymentTimelineSourceSchema = z.enum([
  "appaloft",
  "ssh",
  "docker",
  "application",
  "provider",
  "health",
  "domain-event",
]);

export const deploymentTimelineKindSchema = z.enum([
  "lifecycle",
  "step",
  "command",
  "output",
  "container-log",
  "health-check",
  "status",
  "diagnostic",
  "gap",
]);

const commaSeparatedArrayInput = (value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
};

export const deploymentTimelineQueryInputSchema = z.object({
  deploymentId: nonEmptyTrimmedString("Deployment id"),
  cursor: z.string().trim().min(1, "Cursor must not be empty").optional(),
  limit: z.coerce.number().int().min(0).max(500).default(100),
  kinds: z.preprocess(commaSeparatedArrayInput, z.array(deploymentTimelineKindSchema).optional()),
  sources: z.preprocess(
    commaSeparatedArrayInput,
    z.array(deploymentTimelineSourceSchema).optional(),
  ),
});

export const streamDeploymentTimelineQueryInputSchema = deploymentTimelineQueryInputSchema.extend({
  follow: booleanQueryParamSchema.default(false),
  includeHistory: booleanQueryParamSchema.optional(),
  untilTerminal: booleanQueryParamSchema.default(true),
});

export type DeploymentTimelineQueryInput = z.input<typeof deploymentTimelineQueryInputSchema>;
export type DeploymentTimelineQueryParsedInput = z.output<
  typeof deploymentTimelineQueryInputSchema
>;
export type StreamDeploymentTimelineQueryInput = z.input<
  typeof streamDeploymentTimelineQueryInputSchema
>;
export type StreamDeploymentTimelineQueryParsedInput = z.output<
  typeof streamDeploymentTimelineQueryInputSchema
>;
