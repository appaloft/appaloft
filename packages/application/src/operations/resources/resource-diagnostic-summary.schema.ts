import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

const optionalNonEmptyTrimmedString = (label: string) => nonEmptyTrimmedString(label).optional();

const booleanInput = (defaultValue: boolean) =>
  z
    .union([
      z.boolean(),
      z.literal("true").transform(() => true),
      z.literal("false").transform(() => false),
    ])
    .default(defaultValue);

export const resourceDiagnosticSummaryQueryInputSchema = z.object({
  resourceId: nonEmptyTrimmedString("Resource id"),
  deploymentId: optionalNonEmptyTrimmedString("Deployment id"),
  includeDeploymentLogTail: booleanInput(true),
  includeRuntimeLogTail: booleanInput(false),
  includeProxyConfiguration: booleanInput(false),
  tailLines: z.coerce.number().int().min(0).max(50).default(20),
  locale: optionalNonEmptyTrimmedString("Locale"),
});

export type ResourceDiagnosticSummaryQueryInput = z.input<
  typeof resourceDiagnosticSummaryQueryInputSchema
>;
export type ResourceDiagnosticSummaryQueryParsedInput = z.output<
  typeof resourceDiagnosticSummaryQueryInputSchema
>;
