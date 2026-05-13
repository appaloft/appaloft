import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const auditEventPayloadValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string()).readonly(),
]);

export const listAuditEventsQueryInputSchema = z.object({
  aggregateId: nonEmptyTrimmedString("Aggregate id").optional(),
  eventType: nonEmptyTrimmedString("Event type").optional(),
  limit: z.number().int().positive().max(100).optional(),
  cursor: nonEmptyTrimmedString("Cursor").optional(),
});

export const showAuditEventQueryInputSchema = z.object({
  auditEventId: nonEmptyTrimmedString("Audit event id"),
  aggregateId: nonEmptyTrimmedString("Aggregate id").optional(),
});

export const exportAuditEventsQueryInputSchema = z
  .object({
    aggregateId: nonEmptyTrimmedString("Aggregate id").optional(),
    eventType: nonEmptyTrimmedString("Event type").optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    limit: z.coerce.number().int().positive().max(500).default(100),
  })
  .refine((value) => !value.from || !value.to || value.from < value.to, {
    path: ["to"],
    message: "to must be later than from",
  });

export const exportGlobalAuditEventsQueryInputSchema = z
  .object({
    aggregateId: nonEmptyTrimmedString("Aggregate id").optional(),
    eventType: nonEmptyTrimmedString("Event type").optional(),
    from: z.string().datetime(),
    to: z.string().datetime(),
    limit: z.coerce.number().int().positive().max(500).default(100),
  })
  .refine((value) => value.from < value.to, {
    path: ["to"],
    message: "to must be later than from",
  });

export const pruneAuditEventsCommandInputSchema = z.object({
  before: z.string().datetime(),
  aggregateId: nonEmptyTrimmedString("Aggregate id").optional(),
  eventType: nonEmptyTrimmedString("Event type").optional(),
  dryRun: z.boolean().default(true),
});

export const auditEventLegalHoldStatusSchema = z.enum(["active", "released"]);

export const configureAuditEventLegalHoldCommandInputSchema = z
  .object({
    reason: nonEmptyTrimmedString("Reason"),
    aggregateId: nonEmptyTrimmedString("Aggregate id").optional(),
    eventType: nonEmptyTrimmedString("Event type").optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    requestedBy: nonEmptyTrimmedString("Requested by").optional(),
  })
  .refine((value) => value.aggregateId || (value.from && value.to), {
    path: ["aggregateId"],
    message: "Audit event legal hold requires aggregate id or bounded global window",
  })
  .refine((value) => !value.from || !value.to || value.from < value.to, {
    path: ["to"],
    message: "to must be later than from",
  });

export const releaseAuditEventLegalHoldCommandInputSchema = z.object({
  holdId: nonEmptyTrimmedString("Hold id"),
  releaseReason: nonEmptyTrimmedString("Release reason"),
  releasedBy: nonEmptyTrimmedString("Released by").optional(),
});

export const listAuditEventLegalHoldsQueryInputSchema = z.object({
  status: auditEventLegalHoldStatusSchema.optional(),
  aggregateId: nonEmptyTrimmedString("Aggregate id").optional(),
  eventType: nonEmptyTrimmedString("Event type").optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  cursor: nonEmptyTrimmedString("Cursor").optional(),
});

export const showAuditEventLegalHoldQueryInputSchema = z.object({
  holdId: nonEmptyTrimmedString("Hold id"),
});

export const createAuditEventArchiveCommandInputSchema = z
  .object({
    reason: nonEmptyTrimmedString("Reason"),
    aggregateId: nonEmptyTrimmedString("Aggregate id").optional(),
    eventType: nonEmptyTrimmedString("Event type").optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    limit: z.coerce.number().int().positive().max(500).default(100),
    retainSourceRows: z.boolean().default(false),
  })
  .refine((value) => value.aggregateId || (value.from && value.to), {
    path: ["aggregateId"],
    message: "Audit event archive requires aggregate id or bounded global window",
  })
  .refine((value) => !value.from || !value.to || value.from < value.to, {
    path: ["to"],
    message: "to must be later than from",
  });

export const listAuditEventArchivesQueryInputSchema = z
  .object({
    aggregateId: nonEmptyTrimmedString("Aggregate id").optional(),
    eventType: nonEmptyTrimmedString("Event type").optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    limit: z.coerce.number().int().positive().max(100).default(50),
    cursor: nonEmptyTrimmedString("Cursor").optional(),
  })
  .refine((value) => !value.from || !value.to || value.from < value.to, {
    path: ["to"],
    message: "to must be later than from",
  });

export const showAuditEventArchiveQueryInputSchema = z.object({
  archiveId: nonEmptyTrimmedString("Archive id"),
});

export const pruneAuditEventArchivesCommandInputSchema = z.object({
  before: z.string().datetime(),
  aggregateId: nonEmptyTrimmedString("Aggregate id").optional(),
  eventType: nonEmptyTrimmedString("Event type").optional(),
  dryRun: z.boolean().default(true),
});

export type ListAuditEventsQueryInput = z.input<typeof listAuditEventsQueryInputSchema>;
export type ShowAuditEventQueryInput = z.input<typeof showAuditEventQueryInputSchema>;
export type ExportAuditEventsQueryInput = z.input<typeof exportAuditEventsQueryInputSchema>;
export type ExportGlobalAuditEventsQueryInput = z.input<
  typeof exportGlobalAuditEventsQueryInputSchema
>;
export type PruneAuditEventsCommandInput = z.input<typeof pruneAuditEventsCommandInputSchema>;
export type AuditEventLegalHoldStatus = z.output<typeof auditEventLegalHoldStatusSchema>;
export type ConfigureAuditEventLegalHoldCommandInput = z.input<
  typeof configureAuditEventLegalHoldCommandInputSchema
>;
export type ReleaseAuditEventLegalHoldCommandInput = z.input<
  typeof releaseAuditEventLegalHoldCommandInputSchema
>;
export type ListAuditEventLegalHoldsQueryInput = z.input<
  typeof listAuditEventLegalHoldsQueryInputSchema
>;
export type ShowAuditEventLegalHoldQueryInput = z.input<
  typeof showAuditEventLegalHoldQueryInputSchema
>;
export type CreateAuditEventArchiveCommandInput = z.input<
  typeof createAuditEventArchiveCommandInputSchema
>;
export type ListAuditEventArchivesQueryInput = z.input<
  typeof listAuditEventArchivesQueryInputSchema
>;
export type ShowAuditEventArchiveQueryInput = z.input<typeof showAuditEventArchiveQueryInputSchema>;
export type PruneAuditEventArchivesCommandInput = z.input<
  typeof pruneAuditEventArchivesCommandInputSchema
>;
