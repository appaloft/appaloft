import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

const optionalNonEmptyTrimmedString = (label: string) => nonEmptyTrimmedString(label).optional();

const booleanInput = z
  .union([
    z.boolean(),
    z.literal("true").transform(() => true),
    z.literal("false").transform(() => false),
  ])
  .default(false);

export const resourceRuntimeLogsQueryInputSchema = z
  .object({
    resourceId: optionalNonEmptyTrimmedString("Resource id"),
    previewEnvironmentId: optionalNonEmptyTrimmedString("Preview environment id"),
    deploymentId: optionalNonEmptyTrimmedString("Deployment id"),
    serviceName: optionalNonEmptyTrimmedString("Service name"),
    tailLines: z.coerce.number().int().min(0).max(1000).default(100),
    since: optionalNonEmptyTrimmedString("Since"),
    cursor: optionalNonEmptyTrimmedString("Cursor"),
    follow: booleanInput,
  })
  .superRefine((input, context) => {
    if (input.resourceId || input.previewEnvironmentId) {
      return;
    }

    context.addIssue({
      code: "custom",
      message: "Either resourceId or previewEnvironmentId is required",
      path: ["resourceId"],
    });
  });

export type ResourceRuntimeLogsQueryInput = z.input<typeof resourceRuntimeLogsQueryInputSchema>;
export type ResourceRuntimeLogsQueryParsedInput = z.output<
  typeof resourceRuntimeLogsQueryInputSchema
>;
