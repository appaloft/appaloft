import {
  destinationKinds,
  edgeProxyKinds,
  environmentKinds,
  resourceKinds,
  resourceServiceKinds,
  tlsModes,
} from "@yundu/core";
import { z } from "zod";

export const yunduDeploymentConfigFileNames = [
  "yundu.json",
  "yundu.config.json",
  ".yundu.json",
] as const;

export const deploymentMethods = [
  "auto",
  "dockerfile",
  "docker-compose",
  "prebuilt-image",
  "workspace-commands",
] as const;

const nonEmptyStringSchema = z.string().trim().min(1);

export const yunduDeploymentProjectConfigSchema = z
  .object({
    name: nonEmptyStringSchema.describe("Project name to reuse or create."),
    description: z.string().trim().min(1).optional().describe("Optional project description."),
  })
  .describe("Project bootstrap settings.");

export const yunduDeploymentEnvironmentConfigSchema = z
  .object({
    name: nonEmptyStringSchema.describe("Environment name to reuse or create."),
    kind: z
      .enum(environmentKinds)
      .optional()
      .describe("Environment kind. Defaults to custom when omitted."),
  })
  .describe("Environment bootstrap settings.");

export const yunduDeploymentResourceServiceConfigSchema = z
  .object({
    name: nonEmptyStringSchema.describe("Service name inside a compose-stack resource."),
    kind: z.enum(resourceServiceKinds).describe("Service role inside the resource."),
  })
  .describe("Service entry inside a resource.");

export const yunduDeploymentResourceConfigSchema = z
  .object({
    name: nonEmptyStringSchema.describe("Resource name to reuse or create."),
    kind: z.enum(resourceKinds).optional().describe("Resource kind. Defaults to application."),
    description: z.string().trim().min(1).optional().describe("Optional resource description."),
    services: z
      .array(yunduDeploymentResourceServiceConfigSchema)
      .optional()
      .describe("Services contained by a compose-stack resource."),
  })
  .describe("Resource bootstrap settings.");

const targetBaseSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Stable target key for deployment.targetKey selection."),
  name: z.string().trim().min(1).optional().describe("Deployment target display name."),
  host: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Target host. Local shell defaults to 127.0.0.1 when omitted."),
  port: z.number().int().positive().optional().describe("Target management port."),
  destination: z
    .object({
      name: z.string().trim().min(1).optional(),
      kind: z.enum(destinationKinds).optional(),
    })
    .optional()
    .describe("Deployment destination or isolation boundary on the selected server."),
});

export const yunduDeploymentTargetConfigSchema = z
  .union([
    targetBaseSchema.extend({
      providerKey: nonEmptyStringSchema.describe(
        "Registered provider key, for example local-shell.",
      ),
    }),
    targetBaseSchema.extend({
      provider: nonEmptyStringSchema.describe("Alias for providerKey."),
    }),
  ])
  .describe("Deployment target bootstrap settings.");

export const yunduDeploymentRuntimeConfigSchema = z
  .object({
    targetKey: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Configured target key, name, or provider alias to deploy to."),
    target: z.string().trim().min(1).optional().describe("Alias for targetKey."),
    method: z.enum(deploymentMethods).optional().describe("Requested deployment method."),
    installCommand: z.string().trim().min(1).optional(),
    buildCommand: z.string().trim().min(1).optional(),
    startCommand: z.string().trim().min(1).optional(),
    port: z.number().int().positive().optional().describe("Application port."),
    healthCheckPath: z.string().trim().min(1).optional(),
    healthPath: z.string().trim().min(1).optional().describe("Alias for healthCheckPath."),
    proxy: z
      .enum(edgeProxyKinds)
      .optional()
      .describe(
        "Edge proxy to configure for public domains. Defaults to traefik when domains are set.",
      ),
    domain: z.string().trim().min(1).optional().describe("Single public domain alias."),
    domains: z
      .array(z.string().trim().min(1))
      .optional()
      .describe("Public domains for access routing."),
    pathPrefix: z.string().trim().min(1).optional().describe("Public route path prefix."),
    tlsMode: z.enum(tlsModes).optional().describe("TLS handling for the public access route."),
  })
  .describe("Deployment command defaults.");

export const yunduDeploymentConfigSchema = z
  .object({
    $schema: z.string().trim().min(1).optional(),
    project: yunduDeploymentProjectConfigSchema.optional(),
    environment: yunduDeploymentEnvironmentConfigSchema.optional(),
    resource: yunduDeploymentResourceConfigSchema.optional(),
    targets: z.array(yunduDeploymentTargetConfigSchema).optional(),
    servers: z
      .array(yunduDeploymentTargetConfigSchema)
      .optional()
      .describe("Alias for targets, kept for transport-compatible server wording."),
    deployment: yunduDeploymentRuntimeConfigSchema.optional(),
  })
  .describe("Yundu deployment config file.");

export type YunduDeploymentConfigInput = z.input<typeof yunduDeploymentConfigSchema>;
export type YunduDeploymentConfig = z.output<typeof yunduDeploymentConfigSchema>;
export type YunduDeploymentTargetConfig = z.output<typeof yunduDeploymentTargetConfigSchema>;

export function providerKeyFromTargetConfig(target: YunduDeploymentTargetConfig): string {
  return "providerKey" in target ? target.providerKey : target.provider;
}

export function targetKeyFromDeploymentConfig(config: YunduDeploymentConfig): string | undefined {
  return config.deployment?.targetKey ?? config.deployment?.target;
}

export function healthCheckPathFromDeploymentConfig(
  config: YunduDeploymentConfig,
): string | undefined {
  return config.deployment?.healthCheckPath ?? config.deployment?.healthPath;
}

export function domainsFromDeploymentConfig(config: YunduDeploymentConfig): string[] | undefined {
  const domains = [
    ...(config.deployment?.domain ? [config.deployment.domain] : []),
    ...(config.deployment?.domains ?? []),
  ];

  return domains.length > 0 ? [...new Set(domains)] : undefined;
}

export function targetsFromDeploymentConfig(
  config: YunduDeploymentConfig,
): YunduDeploymentTargetConfig[] {
  return config.targets ?? config.servers ?? [];
}

export function parseYunduDeploymentConfig(input: unknown) {
  return yunduDeploymentConfigSchema.safeParse(input);
}

export const yunduDeploymentConfigJsonSchema = z.toJSONSchema(yunduDeploymentConfigSchema);
