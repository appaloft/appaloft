import { z } from "zod";

import { dependencyResourceKinds } from "../../ports";
import { environmentKindSchema, nonEmptyTrimmedString } from "../shared-schema";

export const duplicateEnvironmentProfileDependencyDecisionSchema = z
  .object({
    dependencyResourceId: nonEmptyTrimmedString("Dependency resource id"),
    decision: z.enum(["create-new-managed", "bind-existing", "reuse-source", "defer"]),
    targetDependencyResourceId: nonEmptyTrimmedString("Target dependency resource id").optional(),
    providerKey: nonEmptyTrimmedString("Provider key").optional(),
    accessMode: z.enum(["read-only", "read-write"]).optional(),
    acknowledgement: nonEmptyTrimmedString("Acknowledgement").optional(),
  })
  .superRefine((value, context) => {
    if (value.decision === "bind-existing" && !value.targetDependencyResourceId) {
      context.addIssue({
        code: "custom",
        path: ["targetDependencyResourceId"],
        message: "bind-existing requires targetDependencyResourceId",
      });
    }

    if (value.decision === "reuse-source" && !value.acknowledgement) {
      context.addIssue({
        code: "custom",
        path: ["acknowledgement"],
        message: "reuse-source requires explicit acknowledgement",
      });
    }
  });

export const duplicateEnvironmentProfileResourceDecisionSchema = z.object({
  resourceId: nonEmptyTrimmedString("Resource id"),
  decision: z.enum(["copy-shape", "defer"]),
});

export const duplicateEnvironmentProfileCommandInputSchema = z.object({
  environmentId: nonEmptyTrimmedString("Source environment id"),
  targetName: nonEmptyTrimmedString("Target environment name"),
  targetKind: environmentKindSchema.optional(),
  resourceDecisions: z.array(duplicateEnvironmentProfileResourceDecisionSchema).optional(),
  dependencyDecisions: z.array(duplicateEnvironmentProfileDependencyDecisionSchema).default([]),
  dependencyKindsToRequire: z.array(z.enum(dependencyResourceKinds)).optional(),
});

export type DuplicateEnvironmentProfileCommandInput = z.input<
  typeof duplicateEnvironmentProfileCommandInputSchema
>;
export type DuplicateEnvironmentProfileCommandPayload = z.output<
  typeof duplicateEnvironmentProfileCommandInputSchema
>;
export type DuplicateEnvironmentProfileDependencyDecision = z.output<
  typeof duplicateEnvironmentProfileDependencyDecisionSchema
>;
export type DuplicateEnvironmentProfileResourceDecision = z.output<
  typeof duplicateEnvironmentProfileResourceDecisionSchema
>;
