import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const createDeploymentCommandInputSchema = z.object({
  configFilePath: nonEmptyTrimmedString("Deployment config file path").optional(),
  projectId: nonEmptyTrimmedString("Project id").optional(),
  serverId: nonEmptyTrimmedString("Server id").optional(),
  environmentId: nonEmptyTrimmedString("Environment id").optional(),
  sourceLocator: nonEmptyTrimmedString("Source locator"),
  deploymentMethod: z
    .enum(["auto", "dockerfile", "docker-compose", "prebuilt-image", "workspace-commands"])
    .optional(),
  installCommand: z.string().trim().min(1).optional(),
  buildCommand: z.string().trim().min(1).optional(),
  startCommand: z.string().trim().min(1).optional(),
  port: z.number().int().positive().optional(),
  healthCheckPath: z.string().trim().min(1).optional(),
});

export type CreateDeploymentCommandInput = z.input<typeof createDeploymentCommandInputSchema>;
