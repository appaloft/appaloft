import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const previewPolicyProviderSchema = z.literal("github");
export const previewPolicyEventKindSchema = z.literal("pull-request");
export const previewPolicyPullRequestActionSchema = z.enum(["opened", "reopened", "synchronize"]);
export const previewPolicyForkModeSchema = z.enum(["disabled", "without-secrets", "with-secrets"]);

export const defaultPreviewPolicySettings = {
  sameRepositoryPreviews: true,
  forkPreviews: "disabled" as const,
  secretBackedPreviews: true,
};

export const previewPolicySettingsSchema = z
  .object({
    sameRepositoryPreviews: z.boolean().optional(),
    forkPreviews: previewPolicyForkModeSchema.optional(),
    secretBackedPreviews: z.boolean().optional(),
    maxActivePreviews: z.number().int().nonnegative().optional(),
    previewTtlHours: z.number().int().positive().optional(),
  })
  .default(defaultPreviewPolicySettings)
  .transform((settings) => ({
    ...defaultPreviewPolicySettings,
    ...settings,
  }));

export const previewPolicyEvaluationInputSchema = z.object({
  provider: previewPolicyProviderSchema,
  eventKind: previewPolicyEventKindSchema,
  eventAction: previewPolicyPullRequestActionSchema,
  repositoryFullName: nonEmptyTrimmedString("Repository full name"),
  headRepositoryFullName: nonEmptyTrimmedString("Head repository full name"),
  pullRequestNumber: z.number().int().positive(),
  headSha: nonEmptyTrimmedString("Head SHA"),
  baseRef: nonEmptyTrimmedString("Base ref"),
  verified: z.boolean().default(false),
  requestedSecretScopes: z.array(nonEmptyTrimmedString("Requested secret scope")).default([]),
  activePreviewCount: z.number().int().nonnegative().default(0),
  policy: previewPolicySettingsSchema,
});

export type PreviewPolicyEvaluationInput = z.input<typeof previewPolicyEvaluationInputSchema>;
export type PreviewPolicyEvaluationPayload = z.output<typeof previewPolicyEvaluationInputSchema>;
