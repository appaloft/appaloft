import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

const optionalNonEmptyString = z.string().trim().min(1).optional();

export const defaultAccessDomainPolicyScopeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("system"),
  }),
  z.object({
    kind: z.literal("deployment-target"),
    serverId: nonEmptyTrimmedString("Server id"),
  }),
]);

export const defaultAccessDomainPolicyModeSchema = z.enum([
  "disabled",
  "provider",
  "custom-template",
]);

export const configureDefaultAccessDomainPolicyCommandInputSchema = z
  .object({
    scope: defaultAccessDomainPolicyScopeSchema,
    mode: defaultAccessDomainPolicyModeSchema,
    providerKey: optionalNonEmptyString,
    templateRef: optionalNonEmptyString,
    idempotencyKey: optionalNonEmptyString,
  })
  .superRefine((value, context) => {
    if (value.mode === "provider" && !value.providerKey) {
      context.addIssue({
        code: "custom",
        path: ["providerKey"],
        message: "Provider key is required for provider mode",
      });
    }

    if (value.mode === "custom-template") {
      if (!value.providerKey) {
        context.addIssue({
          code: "custom",
          path: ["providerKey"],
          message: "Provider key is required for custom-template mode",
        });
      }

      if (!value.templateRef) {
        context.addIssue({
          code: "custom",
          path: ["templateRef"],
          message: "Template ref is required for custom-template mode",
        });
      }
    }

    if (value.mode !== "custom-template" && value.templateRef) {
      context.addIssue({
        code: "custom",
        path: ["templateRef"],
        message: "Template ref is only allowed for custom-template mode",
      });
    }

    if (value.mode === "disabled" && value.providerKey) {
      context.addIssue({
        code: "custom",
        path: ["providerKey"],
        message: "Provider key is not allowed for disabled mode",
      });
    }
  });

export type ConfigureDefaultAccessDomainPolicyCommandInput = z.input<
  typeof configureDefaultAccessDomainPolicyCommandInputSchema
>;
export type ConfigureDefaultAccessDomainPolicyCommandPayload = z.output<
  typeof configureDefaultAccessDomainPolicyCommandInputSchema
>;
