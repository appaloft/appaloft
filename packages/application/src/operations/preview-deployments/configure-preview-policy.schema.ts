import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";
import { previewPolicySettingsSchema } from "./preview-policy.schema";

export const previewPolicyScopeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("project"),
    projectId: nonEmptyTrimmedString("Project id"),
  }),
  z.object({
    kind: z.literal("resource"),
    projectId: nonEmptyTrimmedString("Project id"),
    resourceId: nonEmptyTrimmedString("Resource id"),
  }),
]);

export const configurePreviewPolicyCommandInputSchema = z.object({
  scope: previewPolicyScopeSchema,
  policy: previewPolicySettingsSchema,
  idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
});

export type ConfigurePreviewPolicyCommandInput = z.input<
  typeof configurePreviewPolicyCommandInputSchema
>;
export type ConfigurePreviewPolicyCommandPayload = z.output<
  typeof configurePreviewPolicyCommandInputSchema
>;
