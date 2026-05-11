import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const deployTokenWorkflowCommandSchema = z.enum([
  "preview-cleanup",
  "server-config-deploy",
  "source-link-deploy",
]);

export const deployTokenScopeInputSchema = z.object({
  deploymentTargetIds: z.array(nonEmptyTrimmedString("Deployment target id")).optional(),
  environmentIds: z.array(nonEmptyTrimmedString("Environment id")).optional(),
  projectIds: z.array(nonEmptyTrimmedString("Project id")).optional(),
  repositoryFullNames: z.array(nonEmptyTrimmedString("Repository full name")).optional(),
  resourceIds: z.array(nonEmptyTrimmedString("Resource id")).optional(),
  workflowCommands: z.array(deployTokenWorkflowCommandSchema).min(1),
});

export const deployTokenConfirmationSchema = z.object({
  tokenId: nonEmptyTrimmedString("Confirmation deploy token id"),
});

export type DeployTokenWorkflowCommandInput = z.output<typeof deployTokenWorkflowCommandSchema>;
export type DeployTokenScopeInput = z.output<typeof deployTokenScopeInputSchema>;
