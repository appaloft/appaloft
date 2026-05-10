import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const createActionSourceLinkDeploymentCommandInputSchema = z
  .object({
    sourceFingerprint: nonEmptyTrimmedString("Source fingerprint"),
    projectId: nonEmptyTrimmedString("Project id").optional(),
    environmentId: nonEmptyTrimmedString("Environment id").optional(),
    resourceId: nonEmptyTrimmedString("Resource id").optional(),
    serverId: nonEmptyTrimmedString("Server id").optional(),
    destinationId: nonEmptyTrimmedString("Destination id").optional(),
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
