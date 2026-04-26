import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const showDefaultAccessDomainPolicyScopeKindSchema = z
  .enum(["system", "deployment-target"])
  .default("system");

export const showDefaultAccessDomainPolicyQueryInputSchema = z
  .object({
    scopeKind: showDefaultAccessDomainPolicyScopeKindSchema,
    serverId: nonEmptyTrimmedString("Server id").optional(),
  })
  .superRefine((value, context) => {
    if (value.scopeKind === "deployment-target" && !value.serverId) {
      context.addIssue({
        code: "custom",
        path: ["serverId"],
        message: "Server id is required for deployment-target scope",
      });
    }

    if (value.scopeKind === "system" && value.serverId) {
      context.addIssue({
        code: "custom",
        path: ["serverId"],
        message: "Server id is only allowed for deployment-target scope",
      });
    }
  });

export type ShowDefaultAccessDomainPolicyQueryInput = z.input<
  typeof showDefaultAccessDomainPolicyQueryInputSchema
>;
export type ShowDefaultAccessDomainPolicyQueryPayload = z.output<
  typeof showDefaultAccessDomainPolicyQueryInputSchema
>;
