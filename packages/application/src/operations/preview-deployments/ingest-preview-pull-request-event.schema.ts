import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const previewPullRequestEventSchema = z.object({
  provider: z.literal("github"),
  eventKind: z.literal("pull-request"),
  eventAction: z.enum(["opened", "reopened", "synchronize", "closed"]),
  repositoryFullName: nonEmptyTrimmedString("Repository full name"),
  headRepositoryFullName: nonEmptyTrimmedString("Head repository full name"),
  pullRequestNumber: z.coerce.number().int().positive(),
  headSha: nonEmptyTrimmedString("Head SHA"),
  baseRef: nonEmptyTrimmedString("Base ref"),
  verified: z.literal(true),
  deliveryId: nonEmptyTrimmedString("Delivery id").optional(),
  receivedAt: nonEmptyTrimmedString("Received timestamp").optional(),
});

export const ingestPreviewPullRequestEventCommandInputSchema = z.object({
  sourceEventId: nonEmptyTrimmedString("Source event id"),
  event: previewPullRequestEventSchema,
  projectId: nonEmptyTrimmedString("Project id"),
  environmentId: nonEmptyTrimmedString("Environment id"),
  resourceId: nonEmptyTrimmedString("Resource id"),
  serverId: nonEmptyTrimmedString("Server id"),
  destinationId: nonEmptyTrimmedString("Destination id"),
  sourceBindingFingerprint: nonEmptyTrimmedString("Source binding fingerprint"),
});

export type IngestPreviewPullRequestEventCommandInput = z.input<
  typeof ingestPreviewPullRequestEventCommandInputSchema
>;
export type IngestPreviewPullRequestEventCommandPayload = z.output<
  typeof ingestPreviewPullRequestEventCommandInputSchema
>;
