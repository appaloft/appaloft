import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

const configureResourceAutoDeployModeSchema = z.enum([
  "enable",
  "disable",
  "replace",
  "acknowledge-source-binding",
]);

const resourceAutoDeployPolicyInputSchema = z
  .object({
    triggerKind: z.enum(["git-push", "generic-signed-webhook"]),
    refs: z.array(nonEmptyTrimmedString("Auto-deploy ref")).min(1),
    eventKinds: z.array(z.enum(["push", "tag"])).min(1),
    includePaths: z
      .array(nonEmptyTrimmedString("Auto-deploy include path"))
      .min(1)
      .max(100)
      .optional(),
    excludePaths: z
      .array(nonEmptyTrimmedString("Auto-deploy exclude path"))
      .min(1)
      .max(100)
      .optional(),
    genericWebhookSecretRef: nonEmptyTrimmedString("Generic webhook secret reference").optional(),
    dedupeWindowSeconds: z.number().int().positive().optional(),
  })
  .superRefine((policy, context) => {
    if (
      policy.triggerKind !== "git-push" &&
      ((policy.includePaths?.length ?? 0) > 0 || (policy.excludePaths?.length ?? 0) > 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "Auto-deploy path filters require git-push trigger kind",
        path: ["includePaths"],
      });
    }
  });

export const configureResourceAutoDeployCommandInputSchema = z
  .object({
    resourceId: nonEmptyTrimmedString("Resource id"),
    mode: configureResourceAutoDeployModeSchema,
    sourceBindingFingerprint: nonEmptyTrimmedString("Source binding fingerprint").optional(),
    policy: resourceAutoDeployPolicyInputSchema.optional(),
    idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
  })
  .superRefine((input, context) => {
    if ((input.mode === "enable" || input.mode === "replace") && !input.policy) {
      context.addIssue({
        code: "custom",
        message: "Auto-deploy policy is required for enable or replace",
        path: ["policy"],
      });
    }

    if (input.mode === "acknowledge-source-binding" && !input.sourceBindingFingerprint) {
      context.addIssue({
        code: "custom",
        message: "Source binding fingerprint is required for acknowledgement",
        path: ["sourceBindingFingerprint"],
      });
    }
  });

export type ConfigureResourceAutoDeployCommandInput = z.input<
  typeof configureResourceAutoDeployCommandInputSchema
>;
export type ConfigureResourceAutoDeployCommandPayload = z.output<
  typeof configureResourceAutoDeployCommandInputSchema
>;

export interface ConfigureResourceAutoDeployResult {
  resourceId: string;
  status: "enabled" | "disabled" | "blocked";
  triggerKind?: "git-push" | "generic-signed-webhook";
  refs?: string[];
  eventKinds?: ("push" | "tag")[];
  includePaths?: string[];
  excludePaths?: string[];
  sourceBindingFingerprint?: string;
  blockedReason?: "source-binding-changed";
}
