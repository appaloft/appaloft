import { z } from "zod";

const resourceRefsSchema = z
  .object({
    organizationId: z.string().trim().min(1).optional(),
    projectId: z.string().trim().min(1).optional(),
    environmentId: z.string().trim().min(1).optional(),
    resourceId: z.string().trim().min(1).optional(),
    serverId: z.string().trim().min(1).optional(),
    destinationId: z.string().trim().min(1).optional(),
    deploymentId: z.string().trim().min(1).optional(),
  })
  .catchall(z.string().trim().min(1).optional());

const actorSchema = z.object({
  kind: z.string().trim().min(1).optional(),
  id: z.string().trim().min(1).optional(),
  userId: z.string().trim().min(1).optional(),
  email: z.string().trim().min(1).optional(),
});

const deploymentOverlayDecisionRecordSchema = z.object({
  schemaVersion: z.literal("deployment-overlay.decision/v1"),
  id: z.string().optional(),
  operationKey: z.string(),
  decision: z.enum(["enabled", "skipped", "rejected", "unknown"]),
  reason: z.string(),
  source: z.string(),
  tenantId: z.string().optional(),
  accountId: z.string().optional(),
  organizationId: z.string().optional(),
  actor: actorSchema.optional(),
  resourceRefs: resourceRefsSchema.optional(),
  capabilityKey: z.string().optional(),
  decidedAt: z.string(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const evaluateDeploymentOverlayInputSchema = z.object({
  operationKey: z.string().trim().min(1, "Operation key is required"),
  actor: actorSchema.optional(),
  tenantId: z.string().trim().min(1).optional(),
  accountId: z.string().trim().min(1).optional(),
  organizationId: z.string().trim().min(1).optional(),
  resourceRefs: resourceRefsSchema.optional(),
  capabilityKey: z.string().trim().min(1).optional(),
  source: z.string().trim().min(1, "Deployment overlay source is required"),
  attributes: z.record(z.string(), z.unknown()).optional(),
});

export const evaluateDeploymentOverlayResponseSchema = z.object({
  result: z.object({
    operationKey: z.string(),
    decision: z.enum(["enabled", "skipped", "rejected", "unknown"]),
    allowed: z.boolean(),
    reason: z.string(),
    source: z.string(),
    record: deploymentOverlayDecisionRecordSchema.optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const listDeploymentOverlayDecisionsInputSchema = z.object({
  tenantId: z.string().trim().min(1).optional(),
  accountId: z.string().trim().min(1).optional(),
  organizationId: z.string().trim().min(1).optional(),
  operationKey: z.string().trim().min(1).optional(),
  capabilityKey: z.string().trim().min(1).optional(),
  source: z.string().trim().min(1).optional(),
  limit: z.number().int().positive().max(500).optional(),
});

export const listDeploymentOverlayDecisionsResponseSchema = z.object({
  records: z.array(deploymentOverlayDecisionRecordSchema),
});

export type EvaluateDeploymentOverlayInput = z.input<typeof evaluateDeploymentOverlayInputSchema>;
export type ListDeploymentOverlayDecisionsQueryInput = z.input<
  typeof listDeploymentOverlayDecisionsInputSchema
>;
