import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const resolveActionServerConfigDeploymentTargetCommandInputSchema = z
  .object({
    sourceFingerprint: nonEmptyTrimmedString("Source fingerprint"),
    trustedContext: z
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
      .strict()
      .optional(),
  })
  .strict();

export type ResolveActionServerConfigDeploymentTargetCommandInput = z.input<
  typeof resolveActionServerConfigDeploymentTargetCommandInputSchema
>;

export type ResolveActionServerConfigDeploymentTargetCommandParsedInput = z.output<
  typeof resolveActionServerConfigDeploymentTargetCommandInputSchema
>;

export const resolveActionServerConfigDeploymentTargetResponseSchema = z.object({
  sourceFingerprint: z.string(),
  projectId: z.string(),
  environmentId: z.string(),
  resourceId: z.string(),
  serverId: z.string().optional(),
  destinationId: z.string().optional(),
  updatedAt: z.string(),
  reason: z.string().optional(),
});

export type ResolveActionServerConfigDeploymentTargetResponse = z.output<
  typeof resolveActionServerConfigDeploymentTargetResponseSchema
>;
