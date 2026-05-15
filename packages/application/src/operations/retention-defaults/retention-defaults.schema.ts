import { z } from "zod";

const optionalNonEmptyString = z.string().trim().min(1).optional();

export const retentionDefaultScopeSchema = z.enum(["organization", "system"]);

export const retentionDefaultCategorySchema = z.enum([
  "audit-rows",
  "deployment-logs",
  "domain-event-streams",
  "process-attempts",
  "provider-job-logs",
  "resource-runtime-log-archives",
  "runtime-monitoring-samples",
]);

export const configureRetentionDefaultsCommandInputSchema = z.object({
  policyId: optionalNonEmptyString,
  scope: retentionDefaultScopeSchema.default("system"),
  organizationId: optionalNonEmptyString,
  category: retentionDefaultCategorySchema,
  retentionDays: z.number().int().min(1),
  dryRunSchedulingEnabled: z.boolean().default(true),
  destructiveSchedulingEnabled: z.boolean().default(false),
  enabled: z.boolean().default(true),
});

const queryBooleanSchema = z
  .union([
    z.boolean(),
    z
      .string()
      .trim()
      .transform((value) => value === "true")
      .pipe(z.boolean()),
  ])
  .default(false);

export const listRetentionDefaultsQueryInputSchema = z.object({
  scope: retentionDefaultScopeSchema.optional(),
  organizationId: optionalNonEmptyString,
  category: retentionDefaultCategorySchema.optional(),
  enabledOnly: queryBooleanSchema,
});

export const showRetentionDefaultQueryInputSchema = z.object({
  scope: retentionDefaultScopeSchema.default("system"),
  organizationId: optionalNonEmptyString,
  category: retentionDefaultCategorySchema,
});

export type ConfigureRetentionDefaultsCommandInput = z.input<
  typeof configureRetentionDefaultsCommandInputSchema
>;
export type ConfigureRetentionDefaultsCommandPayload = z.output<
  typeof configureRetentionDefaultsCommandInputSchema
>;
export type ListRetentionDefaultsQueryInput = z.input<typeof listRetentionDefaultsQueryInputSchema>;
export type ListRetentionDefaultsQueryPayload = z.output<
  typeof listRetentionDefaultsQueryInputSchema
>;
export type ShowRetentionDefaultQueryInput = z.input<typeof showRetentionDefaultQueryInputSchema>;
export type ShowRetentionDefaultQueryPayload = z.output<
  typeof showRetentionDefaultQueryInputSchema
>;
