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
    domainBindingId: z.string().trim().min(1).optional(),
    domainId: z.string().trim().min(1).optional(),
    routeId: z.string().trim().min(1).optional(),
    staticArtifactId: z.string().trim().min(1).optional(),
  })
  .catchall(z.string().trim().min(1).optional());

const actorSchema = z.object({
  kind: z.string().trim().min(1).optional(),
  id: z.string().trim().min(1).optional(),
  userId: z.string().trim().min(1).optional(),
  email: z.string().trim().min(1).optional(),
});

const routeSurfaceDecisionRecordSchema = z.object({
  schemaVersion: z.literal("route-surface.decision/v1"),
  id: z.string().optional(),
  operationKey: z.string(),
  decision: z.enum(["enabled", "skipped", "rejected", "unknown"]),
  reason: z.string(),
  source: z.string(),
  surfaceKind: z.string(),
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

export const evaluateRouteSurfaceInputSchema = z.object({
  operationKey: z.string().trim().min(1, "Operation key is required"),
  actor: actorSchema.optional(),
  tenantId: z.string().trim().min(1).optional(),
  accountId: z.string().trim().min(1).optional(),
  organizationId: z.string().trim().min(1).optional(),
  resourceRefs: resourceRefsSchema.optional(),
  capabilityKey: z.string().trim().min(1).optional(),
  source: z.string().trim().min(1, "Route surface source is required"),
  surfaceKind: z.string().trim().min(1, "Route surface kind is required"),
  attributes: z.record(z.string(), z.unknown()).optional(),
});

export const evaluateRouteSurfaceResponseSchema = z.object({
  result: z.object({
    operationKey: z.string(),
    decision: z.enum(["enabled", "skipped", "rejected", "unknown"]),
    allowed: z.boolean(),
    reason: z.string(),
    source: z.string(),
    surfaceKind: z.string(),
    record: routeSurfaceDecisionRecordSchema.optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const listRouteSurfaceDecisionsInputSchema = z.object({
  tenantId: z.string().trim().min(1).optional(),
  accountId: z.string().trim().min(1).optional(),
  organizationId: z.string().trim().min(1).optional(),
  operationKey: z.string().trim().min(1).optional(),
  capabilityKey: z.string().trim().min(1).optional(),
  source: z.string().trim().min(1).optional(),
  surfaceKind: z.string().trim().min(1).optional(),
  limit: z.number().int().positive().max(500).optional(),
});

export const listRouteSurfaceDecisionsResponseSchema = z.object({
  records: z.array(routeSurfaceDecisionRecordSchema),
});

export type EvaluateRouteSurfaceInput = z.input<typeof evaluateRouteSurfaceInputSchema>;
export type ListRouteSurfaceDecisionsQueryInput = z.input<
  typeof listRouteSurfaceDecisionsInputSchema
>;
