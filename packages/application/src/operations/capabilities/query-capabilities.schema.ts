import { z } from "zod";

const resourceRefsSchema = z
  .object({
    projectId: z.string().trim().min(1).optional(),
    environmentId: z.string().trim().min(1).optional(),
    resourceId: z.string().trim().min(1).optional(),
    serverId: z.string().trim().min(1).optional(),
    destinationId: z.string().trim().min(1).optional(),
    deploymentId: z.string().trim().min(1).optional(),
    dependencyResourceId: z.string().trim().min(1).optional(),
    storageVolumeId: z.string().trim().min(1).optional(),
  })
  .catchall(z.string().trim().min(1).optional());

export const queryCapabilitiesInputSchema = z.object({
  queries: z
    .array(
      z.object({
        operationKey: z.string().trim().min(1, "Operation key is required"),
        organizationId: z.string().trim().min(1).optional(),
        resourceRefs: resourceRefsSchema.optional(),
      }),
    )
    .min(1, "At least one capability query is required")
    .max(100, "At most 100 capability queries can be checked at once"),
});

export const queryCapabilitiesResponseSchema = z.object({
  capabilities: z.array(
    z.object({
      operationKey: z.string(),
      allowed: z.boolean(),
      mode: z.enum(["unrestricted", "constrained", "denied"]),
      hint: z.string(),
      reason: z.string(),
      details: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
});
