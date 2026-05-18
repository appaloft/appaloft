import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

const actionDeploymentTrustedContextSchema = z
  .object({
    projectId: nonEmptyTrimmedString("Project id").optional(),
    environmentId: nonEmptyTrimmedString("Environment id").optional(),
    resourceId: nonEmptyTrimmedString("Resource id").optional(),
    serverId: nonEmptyTrimmedString("Server id").optional(),
    destinationId: nonEmptyTrimmedString("Destination id").optional(),
    repositoryFullName: nonEmptyTrimmedString("Repository full name").optional(),
    repositoryId: nonEmptyTrimmedString("Repository id").optional(),
    ref: nonEmptyTrimmedString("Source ref").optional(),
    revision: nonEmptyTrimmedString("Source revision").optional(),
  })
  .strict();

const actionDeployTokenResolvedScopeSchema = z
  .object({
    environmentIds: z.array(nonEmptyTrimmedString("Environment id")).default([]),
    projectIds: z.array(nonEmptyTrimmedString("Project id")).default([]),
    repositoryFullNames: z.array(nonEmptyTrimmedString("Repository full name")).default([]),
    resourceIds: z.array(nonEmptyTrimmedString("Resource id")).default([]),
    serverIds: z.array(nonEmptyTrimmedString("Server id")).default([]),
  })
  .strict();

export const createActionSourceLinkDeploymentCommandInputSchema = z
  .object({
    sourceFingerprint: nonEmptyTrimmedString("Source fingerprint"),
    projectId: nonEmptyTrimmedString("Project id").optional(),
    environmentId: nonEmptyTrimmedString("Environment id").optional(),
    resourceId: nonEmptyTrimmedString("Resource id").optional(),
    serverId: nonEmptyTrimmedString("Server id").optional(),
    destinationId: nonEmptyTrimmedString("Destination id").optional(),
    trustedContext: actionDeploymentTrustedContextSchema.optional(),
    authorizedTokenScope: actionDeployTokenResolvedScopeSchema.optional(),
    executionMode: z.enum(["synchronous", "detached"]).default("synchronous"),
  })
  .strict();

export type CreateActionSourceLinkDeploymentCommandInput = z.input<
  typeof createActionSourceLinkDeploymentCommandInputSchema
>;

export type CreateActionSourceLinkDeploymentCommandParsedInput = z.output<
  typeof createActionSourceLinkDeploymentCommandInputSchema
>;

export const createActionSourceLinkDeploymentResponseSchema = z.object({
  id: z.string(),
});

export type CreateActionSourceLinkDeploymentResponse = z.output<
  typeof createActionSourceLinkDeploymentResponseSchema
>;
