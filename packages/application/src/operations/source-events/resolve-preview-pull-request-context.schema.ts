import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const resolvePreviewPullRequestContextQueryInputSchema = z.object({
  repositoryFullName: nonEmptyTrimmedString("Repository full name"),
  providerRepositoryId: nonEmptyTrimmedString("Provider repository id").optional(),
  installationId: nonEmptyTrimmedString("Installation id").optional(),
  baseRef: nonEmptyTrimmedString("Base ref"),
});

export const resolvePreviewPullRequestContextResponseSchema = z.object({
  projectId: nonEmptyTrimmedString("Project id"),
  environmentId: nonEmptyTrimmedString("Environment id"),
  resourceId: nonEmptyTrimmedString("Resource id"),
  serverId: nonEmptyTrimmedString("Server id"),
  destinationId: nonEmptyTrimmedString("Destination id"),
  sourceBindingFingerprint: nonEmptyTrimmedString("Source binding fingerprint"),
});

export type ResolvePreviewPullRequestContextQueryInput = z.input<
  typeof resolvePreviewPullRequestContextQueryInputSchema
>;
export type ResolvePreviewPullRequestContextQueryParsedInput = z.output<
  typeof resolvePreviewPullRequestContextQueryInputSchema
>;
export type ResolvePreviewPullRequestContextResponse = z.output<
  typeof resolvePreviewPullRequestContextResponseSchema
>;
