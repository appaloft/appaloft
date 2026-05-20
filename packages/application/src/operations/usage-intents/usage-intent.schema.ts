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

const quantitySchema = z.object({
  value: z.number().finite().positive(),
  unit: z.string().trim().min(1),
});

const usageIntentRecordSchema = z.object({
  schemaVersion: z.literal("usage-intent.record/v1"),
  id: z.string(),
  idempotencyKey: z.string(),
  capabilityKey: z.string(),
  status: z.enum(["accepted", "duplicate", "rejected", "unknown_capability"]),
  reason: z.string(),
  source: z.string(),
  tenantId: z.string().optional(),
  accountId: z.string().optional(),
  organizationId: z.string().optional(),
  actor: actorSchema.optional(),
  resourceRefs: resourceRefsSchema.optional(),
  quantity: quantitySchema.optional(),
  occurredAt: z.string(),
  recordedAt: z.string(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const recordUsageIntentInputSchema = z.object({
  idempotencyKey: z.string().trim().min(1, "Idempotency key is required"),
  capabilityKey: z.string().trim().min(1, "Capability key is required"),
  actor: actorSchema.optional(),
  tenantId: z.string().trim().min(1).optional(),
  accountId: z.string().trim().min(1).optional(),
  organizationId: z.string().trim().min(1).optional(),
  resourceRefs: resourceRefsSchema.optional(),
  quantity: quantitySchema.optional(),
  source: z.string().trim().min(1, "Usage intent source is required"),
  occurredAt: z.string().trim().min(1).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
});

export const recordUsageIntentResponseSchema = z.object({
  result: z.object({
    idempotencyKey: z.string(),
    capabilityKey: z.string(),
    accepted: z.boolean(),
    duplicate: z.boolean(),
    status: z.enum(["accepted", "duplicate", "rejected", "unknown_capability"]),
    reason: z.string(),
    source: z.string(),
    record: usageIntentRecordSchema.optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const listUsageIntentRecordsInputSchema = z.object({
  tenantId: z.string().trim().min(1).optional(),
  accountId: z.string().trim().min(1).optional(),
  organizationId: z.string().trim().min(1).optional(),
  capabilityKey: z.string().trim().min(1).optional(),
  source: z.string().trim().min(1).optional(),
  limit: z.number().int().positive().max(500).optional(),
});

export const listUsageIntentRecordsResponseSchema = z.object({
  records: z.array(usageIntentRecordSchema),
});

export type RecordUsageIntentInput = z.input<typeof recordUsageIntentInputSchema>;
export type ListUsageIntentRecordsQueryInput = z.input<typeof listUsageIntentRecordsInputSchema>;
