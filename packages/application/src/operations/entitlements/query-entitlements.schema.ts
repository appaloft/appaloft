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

export const queryEntitlementsInputSchema = z.object({
  queries: z
    .array(
      z.object({
        capabilityKey: z.string().trim().min(1, "Capability key is required"),
        actor: actorSchema.optional(),
        tenantId: z.string().trim().min(1).optional(),
        accountId: z.string().trim().min(1).optional(),
        organizationId: z.string().trim().min(1).optional(),
        resourceRefs: resourceRefsSchema.optional(),
        attributes: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .min(1, "At least one entitlement query is required")
    .max(100, "At most 100 entitlement queries can be checked at once"),
});

export const queryEntitlementsResponseSchema = z.object({
  entitlements: z.array(
    z.object({
      capabilityKey: z.string(),
      entitled: z.boolean(),
      status: z.enum(["entitled", "not_entitled", "unknown"]),
      mode: z.enum(["restricted", "unrestricted", "unknown"]),
      hint: z.string(),
      reason: z.string(),
      source: z.string(),
      details: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
});
