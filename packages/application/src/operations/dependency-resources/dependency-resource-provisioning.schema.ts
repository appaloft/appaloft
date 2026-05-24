import { z } from "zod";

import { dependencyResourceKinds } from "../../ports";
import { nonEmptyTrimmedString } from "../shared-schema";
import { importDependencyResourceCommandInputSchema } from "./import-dependency-resource.schema";
import { provisionDependencyResourceCommandInputSchema } from "./provision-dependency-resource.schema";

export const dependencyResourceProvisioningModeSchema = z.enum(["create", "reuse"]);

export const createDependencyResourceProvisioningPlanInputSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("create"),
    create: provisionDependencyResourceCommandInputSchema,
  }),
  z.object({
    mode: z.literal("reuse"),
    reuse: importDependencyResourceCommandInputSchema,
  }),
]);

export const acceptDependencyResourceProvisioningPlanInputSchema = z.object({
  planId: nonEmptyTrimmedString("Dependency resource provisioning plan id"),
  acknowledgeMutation: z.literal(true),
});

export const showDependencyResourceProvisioningPlanInputSchema = z.object({
  planId: nonEmptyTrimmedString("Dependency resource provisioning plan id"),
});

export const dependencyResourceProvisioningPlanStatusSchema = z.enum([
  "planned",
  "accepted",
  "realized",
  "failed",
]);

export const dependencyResourceProvisioningPlanSchema = z.object({
  id: z.string(),
  mode: dependencyResourceProvisioningModeSchema,
  status: dependencyResourceProvisioningPlanStatusSchema,
  kind: z.enum(dependencyResourceKinds),
  projectId: z.string(),
  environmentId: z.string(),
  name: z.string(),
  providerKey: z.string().optional(),
  serverId: z.string().optional(),
  endpoint: z.string().optional(),
  requiresAcceptance: z.boolean(),
  requestedAt: z.string(),
  acceptedAt: z.string().optional(),
  completedAt: z.string().optional(),
  dependencyResourceId: z.string().optional(),
  failureCode: z.string().optional(),
  failureMessage: z.string().optional(),
  summary: z.array(z.string()),
});

export const dependencyResourceProvisioningPlanResponseSchema = z.object({
  schemaVersion: z.literal("dependency-resource-provisioning.plan/v1"),
  plan: dependencyResourceProvisioningPlanSchema,
  generatedAt: z.string(),
});

export type CreateDependencyResourceProvisioningPlanInput = z.output<
  typeof createDependencyResourceProvisioningPlanInputSchema
>;

export type AcceptDependencyResourceProvisioningPlanInput = z.output<
  typeof acceptDependencyResourceProvisioningPlanInputSchema
>;

export type ShowDependencyResourceProvisioningPlanInput = z.output<
  typeof showDependencyResourceProvisioningPlanInputSchema
>;

export type DependencyResourceProvisioningPlanStatus = z.output<
  typeof dependencyResourceProvisioningPlanStatusSchema
>;

export type DependencyResourceProvisioningPlan = z.output<
  typeof dependencyResourceProvisioningPlanSchema
>;

export type DependencyResourceProvisioningPlanResponse = z.output<
  typeof dependencyResourceProvisioningPlanResponseSchema
>;
