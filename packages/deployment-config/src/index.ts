import {
  destinationKinds,
  edgeProxyKinds,
  environmentKinds,
  resourceKinds,
  resourceServiceKinds,
  tlsModes,
} from "@appaloft/core";
import { z } from "zod";

export const appaloftDeploymentConfigFileNames = [
  "appaloft.json",
  "appaloft.config.json",
  ".appaloft.json",
] as const;

export const deploymentMethods = [
  "auto",
  "dockerfile",
  "docker-compose",
  "prebuilt-image",
  "workspace-commands",
] as const;

const nonEmptyStringSchema = z.string().trim().min(1);

export const appaloftDeploymentProjectConfigSchema = z
  .object({
    name: nonEmptyStringSchema.describe("Project name to reuse or create."),
    description: z.string().trim().min(1).optional().describe("Optional project description."),
  })
  .describe("Project bootstrap settings.");

export const appaloftDeploymentEnvironmentConfigSchema = z
  .object({
    name: nonEmptyStringSchema.describe("Environment name to reuse or create."),
    kind: z
      .enum(environmentKinds)
      .optional()
      .describe("Environment kind. Defaults to custom when omitted."),
  })
  .describe("Environment bootstrap settings.");

export const appaloftDeploymentResourceServiceConfigSchema = z
  .object({
    name: nonEmptyStringSchema.describe("Service name inside a compose-stack resource."),
    kind: z.enum(resourceServiceKinds).describe("Service role inside the resource."),
  })
  .describe("Service entry inside a resource.");

export const appaloftDeploymentResourceConfigSchema = z
  .object({
    name: nonEmptyStringSchema.describe("Resource name to reuse or create."),
    kind: z.enum(resourceKinds).optional().describe("Resource kind. Defaults to application."),
    description: z.string().trim().min(1).optional().describe("Optional resource description."),
    services: z
      .array(appaloftDeploymentResourceServiceConfigSchema)
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

export const appaloftDeploymentTargetConfigSchema = z
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

export const appaloftDeploymentRuntimeConfigSchema = z
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

export const appaloftDeploymentConfigSchema = z
  .object({
    $schema: z.string().trim().min(1).optional(),
    project: appaloftDeploymentProjectConfigSchema.optional(),
    environment: appaloftDeploymentEnvironmentConfigSchema.optional(),
    resource: appaloftDeploymentResourceConfigSchema.optional(),
    targets: z.array(appaloftDeploymentTargetConfigSchema).optional(),
    servers: z
      .array(appaloftDeploymentTargetConfigSchema)
      .optional()
      .describe("Alias for targets, kept for transport-compatible server wording."),
    deployment: appaloftDeploymentRuntimeConfigSchema.optional(),
  })
  .describe("Appaloft deployment config file.");

export type AppaloftDeploymentConfigInput = z.input<typeof appaloftDeploymentConfigSchema>;
export type AppaloftDeploymentConfig = z.output<typeof appaloftDeploymentConfigSchema>;
export type AppaloftDeploymentTargetConfig = z.output<typeof appaloftDeploymentTargetConfigSchema>;

export function providerKeyFromTargetConfig(target: AppaloftDeploymentTargetConfig): string {
  return "providerKey" in target ? target.providerKey : target.provider;
}

export function targetKeyFromDeploymentConfig(
  config: AppaloftDeploymentConfig,
): string | undefined {
  return config.deployment?.targetKey ?? config.deployment?.target;
}

export function healthCheckPathFromDeploymentConfig(
  config: AppaloftDeploymentConfig,
): string | undefined {
  return config.deployment?.healthCheckPath ?? config.deployment?.healthPath;
}

export function domainsFromDeploymentConfig(
  config: AppaloftDeploymentConfig,
): string[] | undefined {
  const domains = [
    ...(config.deployment?.domain ? [config.deployment.domain] : []),
    ...(config.deployment?.domains ?? []),
  ];

  return domains.length > 0 ? [...new Set(domains)] : undefined;
}

export function targetsFromDeploymentConfig(
  config: AppaloftDeploymentConfig,
): AppaloftDeploymentTargetConfig[] {
  return config.targets ?? config.servers ?? [];
}

export function parseAppaloftDeploymentConfig(input: unknown) {
  return appaloftDeploymentConfigSchema.safeParse(input);
}

export const appaloftDeploymentConfigJsonSchema = z.toJSONSchema(appaloftDeploymentConfigSchema);
