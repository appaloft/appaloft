import { edgeProxyKinds, tlsModes } from "@yundu/core";
import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const createDeploymentCommandInputSchema = z.object({
  configFilePath: nonEmptyTrimmedString("Deployment config file path").optional(),
  projectId: nonEmptyTrimmedString("Project id").optional(),
  serverId: nonEmptyTrimmedString("Server id").optional(),
  destinationId: nonEmptyTrimmedString("Destination id").optional(),
  environmentId: nonEmptyTrimmedString("Environment id").optional(),
  resourceId: nonEmptyTrimmedString("Resource id").optional(),
  sourceLocator: nonEmptyTrimmedString("Source locator"),
  deploymentMethod: z
    .enum(["auto", "dockerfile", "docker-compose", "prebuilt-image", "workspace-commands"])
    .optional(),
  installCommand: z.string().trim().min(1).optional(),
  buildCommand: z.string().trim().min(1).optional(),
  startCommand: z.string().trim().min(1).optional(),
  port: z.number().int().positive().optional(),
  healthCheckPath: z.string().trim().min(1).optional(),
  proxyKind: z.enum(edgeProxyKinds).optional(),
  domains: z.array(z.string().trim().min(1)).optional(),
  pathPrefix: z.string().trim().min(1).optional(),
  tlsMode: z.enum(tlsModes).optional(),
});

export type CreateDeploymentCommandInput = z.input<typeof createDeploymentCommandInputSchema>;
