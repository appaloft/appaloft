import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

const optionalNonEmptyTrimmedString = (label: string) => nonEmptyTrimmedString(label).optional();

export const archiveResourceRuntimeLogsCommandInputSchema = z.object({
  resourceId: nonEmptyTrimmedString("Resource id"),
  deploymentId: optionalNonEmptyTrimmedString("Deployment id"),
  serviceName: optionalNonEmptyTrimmedString("Service name"),
  tailLines: z.coerce.number().int().min(1).max(1000).default(100),
  since: optionalNonEmptyTrimmedString("Since"),
  cursor: optionalNonEmptyTrimmedString("Cursor"),
  reason: optionalNonEmptyTrimmedString("Capture reason"),
});

export const listResourceRuntimeLogArchivesQueryInputSchema = z.object({
  resourceId: optionalNonEmptyTrimmedString("Resource id"),
  deploymentId: optionalNonEmptyTrimmedString("Deployment id"),
  serverId: optionalNonEmptyTrimmedString("Server id"),
  serviceName: optionalNonEmptyTrimmedString("Service name"),
  limit: z.coerce.number().int().positive().max(100).default(50),
  cursor: optionalNonEmptyTrimmedString("Cursor"),
});

export const showResourceRuntimeLogArchiveQueryInputSchema = z.object({
  archiveId: nonEmptyTrimmedString("Archive id"),
});

export const pruneResourceRuntimeLogArchivesCommandInputSchema = z.object({
  before: z.string().datetime(),
  resourceId: optionalNonEmptyTrimmedString("Resource id"),
  deploymentId: optionalNonEmptyTrimmedString("Deployment id"),
  serverId: optionalNonEmptyTrimmedString("Server id"),
  serviceName: optionalNonEmptyTrimmedString("Service name"),
  dryRun: z.boolean().default(true),
});

export type ArchiveResourceRuntimeLogsCommandInput = z.input<
  typeof archiveResourceRuntimeLogsCommandInputSchema
>;
export type ListResourceRuntimeLogArchivesQueryInput = z.input<
  typeof listResourceRuntimeLogArchivesQueryInputSchema
>;
export type ShowResourceRuntimeLogArchiveQueryInput = z.input<
  typeof showResourceRuntimeLogArchiveQueryInputSchema
>;
export type PruneResourceRuntimeLogArchivesCommandInput = z.input<
  typeof pruneResourceRuntimeLogArchivesCommandInputSchema
>;
