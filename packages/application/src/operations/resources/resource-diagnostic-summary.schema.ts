import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

const optionalNonEmptyTrimmedString = (label: string) => nonEmptyTrimmedString(label).optional();
const optionalIsoTimestamp = (label: string) =>
  nonEmptyTrimmedString(label)
    .refine((value) => Number.isFinite(Date.parse(value)), `${label} must be an ISO timestamp`)
    .optional();

const booleanInput = (defaultValue: boolean) =>
  z
    .union([
      z.boolean(),
      z.literal("true").transform(() => true),
      z.literal("false").transform(() => false),
    ])
    .default(defaultValue);

export const resourceDiagnosticSummaryQueryInputSchema = z
  .object({
    resourceId: optionalNonEmptyTrimmedString("Resource id"),
    previewEnvironmentId: optionalNonEmptyTrimmedString("Preview environment id"),
    deploymentId: optionalNonEmptyTrimmedString("Deployment id"),
    observationFrom: optionalIsoTimestamp("Observation from"),
    observationTo: optionalIsoTimestamp("Observation to"),
    includeDeploymentTimelineTail: booleanInput(true),
    includeRuntimeLogTail: booleanInput(false),
    includeProxyConfiguration: booleanInput(false),
    tailLines: z.coerce.number().int().min(0).max(50).default(20),
    locale: optionalNonEmptyTrimmedString("Locale"),
  })
  .superRefine((value, context) => {
    if (!value.resourceId && !value.previewEnvironmentId) {
      context.addIssue({
        code: "custom",
        message: "Either resourceId or previewEnvironmentId is required",
        path: ["resourceId"],
      });
    }

    if (Boolean(value.observationFrom) === Boolean(value.observationTo)) {
      return;
    }

    context.addIssue({
      code: "custom",
      message: "Observation window requires both observationFrom and observationTo",
      path: value.observationFrom ? ["observationTo"] : ["observationFrom"],
    });
  });

export type ResourceDiagnosticSummaryQueryInput = z.input<
  typeof resourceDiagnosticSummaryQueryInputSchema
>;
export type ResourceDiagnosticSummaryQueryParsedInput = z.output<
  typeof resourceDiagnosticSummaryQueryInputSchema
>;
