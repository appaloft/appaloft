import {
  resourceExposureModes,
  resourceNetworkProtocols,
  runtimePlanStrategies,
} from "@appaloft/core";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

export const appaloftDeploymentConfigFileNames = [
  "appaloft.json",
  "appaloft.config.json",
  ".appaloft.json",
  "appaloft.yml",
  "appaloft.yaml",
  "appaloft.config.yml",
  "appaloft.config.yaml",
  ".appaloft.yml",
  ".appaloft.yaml",
] as const;

export const deploymentMethods = runtimePlanStrategies;

const nonEmptyStringSchema = z.string().trim().min(1);
const safeRelativePathPattern =
  /^(?!\/)(?![a-zA-Z][a-zA-Z0-9+.-]*:)(?!.*(?:^|[\\/])\.\.(?:[\\/]|$))(?!.*[;&|`$<>]).+$/;
const safeRelativePathSchema = nonEmptyStringSchema.regex(
  safeRelativePathPattern,
  "Path must be relative to the selected source root and must not escape it",
);

const identityConfigFields = new Set([
  "organization",
  "organizationId",
  "org",
  "orgId",
  "project",
  "projectId",
  "environment",
  "environmentId",
  "resource",
  "resourceId",
  "server",
  "serverId",
  "servers",
  "target",
  "targetId",
  "targetKey",
  "targets",
  "destination",
  "destinationId",
  "provider",
  "providerKey",
  "credential",
  "credentialId",
]);

const unsupportedConfigFields = new Set([
  "resources",
  "resourceLimits",
  "resourceProfile",
  "cpu",
  "cpus",
  "memory",
  "memoryMb",
  "memoryMi",
  "replicas",
  "scale",
  "autoscaling",
  "restartPolicy",
  "rollout",
  "deploymentStrategy",
  "dockerComposeFilePath",
  "dockerfilePath",
  "instanceType",
  "disk",
  "gpu",
]);

const secretLikeKeyPattern =
  /(?:secret|password|passwd|token|api[_-]?key|database[_-]?url|connection[_-]?string|private[_-]?key|ssh[_-]?key|credential|certificate|cert)/i;
const rawSecretValuePattern =
  /-----BEGIN [A-Z ]*(?:PRIVATE KEY|CERTIFICATE)-----|(?:ssh-rsa|ssh-ed25519) [A-Za-z0-9+/=]+/;

export type AppaloftDeploymentConfigViolationCode =
  | "config_identity_field"
  | "config_parse_error"
  | "raw_secret_config_field"
  | "unsupported_config_field";

export interface AppaloftDeploymentConfigViolation {
  code: AppaloftDeploymentConfigViolationCode;
  path: (string | number)[];
  message: string;
}

export const appaloftDeploymentSourceConfigSchema = z
  .object({
    baseDirectory: safeRelativePathSchema
      .optional()
      .describe("Relative workspace directory to use as the deployable source root."),
    gitRef: nonEmptyStringSchema.optional().describe("Git ref to record with the source profile."),
    commitSha: nonEmptyStringSchema
      .optional()
      .describe("Immutable git commit SHA to record with the source profile."),
  })
  .strict()
  .describe("Source profile fields. This object must not choose projects or resources.");

export const appaloftDeploymentHealthCheckConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    path: nonEmptyStringSchema.optional().describe("HTTP path used for readiness checks."),
    intervalSeconds: z.number().int().positive().optional(),
    timeoutSeconds: z.number().int().positive().optional(),
    retries: z.number().int().positive().optional(),
  })
  .strict()
  .describe("Health-check profile fields.");

export const appaloftDeploymentRuntimeConfigSchema = z
  .object({
    strategy: z.enum(deploymentMethods).optional().describe("Requested runtime plan strategy."),
    installCommand: nonEmptyStringSchema.optional(),
    buildCommand: nonEmptyStringSchema.optional(),
    startCommand: nonEmptyStringSchema.optional(),
    publishDirectory: safeRelativePathSchema.optional(),
    healthCheckPath: nonEmptyStringSchema.optional(),
    healthCheck: appaloftDeploymentHealthCheckConfigSchema.optional(),
  })
  .strict()
  .describe("Runtime profile fields copied into resource creation for quick deploy.");

export const appaloftDeploymentNetworkConfigSchema = z
  .object({
    internalPort: z.number().int().positive().optional(),
    upstreamProtocol: z.enum(resourceNetworkProtocols).optional(),
    exposureMode: z.enum(resourceExposureModes).optional(),
    targetServiceName: nonEmptyStringSchema.optional(),
    hostPort: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.hostPort && value.exposureMode !== "direct-port") {
      context.addIssue({
        code: "custom",
        path: ["hostPort"],
        message: "hostPort is valid only when exposureMode is direct-port",
      });
    }
  })
  .describe("Network profile fields copied into resource creation for quick deploy.");

const nonSecretEnvironmentValueSchema = z.union([z.string(), z.number(), z.boolean()]);

export const appaloftDeploymentSecretReferenceSchema = z
  .object({
    from: nonEmptyStringSchema.describe(
      "Secret reference, for example environment-secret:database_url or server-credential:ssh_prod.",
    ),
    required: z.boolean().optional(),
    description: z.string().trim().min(1).optional(),
  })
  .strict();

export const appaloftDeploymentConfigSchema = z
  .object({
    $schema: z.string().trim().min(1).optional(),
    source: appaloftDeploymentSourceConfigSchema.optional(),
    runtime: appaloftDeploymentRuntimeConfigSchema.optional(),
    network: appaloftDeploymentNetworkConfigSchema.optional(),
    health: appaloftDeploymentHealthCheckConfigSchema.optional(),
    env: z.record(z.string(), nonSecretEnvironmentValueSchema).optional(),
    secrets: z.record(z.string(), appaloftDeploymentSecretReferenceSchema).optional(),
  })
  .strict()
  .describe("Appaloft repository deployment profile config file.");

export type AppaloftDeploymentConfigInput = z.input<typeof appaloftDeploymentConfigSchema>;
export type AppaloftDeploymentConfig = z.output<typeof appaloftDeploymentConfigSchema>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function shouldTreatIdentityField(path: (string | number)[], key: string): boolean {
  if (!identityConfigFields.has(key)) {
    return false;
  }

  if (path.length === 0) {
    return true;
  }

  const root = String(path[0]);
  return root === "runtime" || root === "deployment" || root === "network" || root === "source";
}

function isAllowedSecretReference(path: (string | number)[], value: unknown): boolean {
  return (
    path.length === 2 &&
    path[0] === "secrets" &&
    isRecord(value) &&
    typeof value.from === "string" &&
    value.from.trim().length > 0
  );
}

function shouldTreatSecretField(path: (string | number)[], key: string, value: unknown): boolean {
  if (path.length === 0 && key === "secrets" && isRecord(value)) {
    return false;
  }

  if (!secretLikeKeyPattern.test(key)) {
    return false;
  }

  return !isAllowedSecretReference([...path, key], value);
}

function containsRawSecretMaterial(value: unknown): boolean {
  return typeof value === "string" && rawSecretValuePattern.test(value);
}

function collectConfigViolations(
  value: unknown,
  path: (string | number)[] = [],
): AppaloftDeploymentConfigViolation[] {
  const violations: AppaloftDeploymentConfigViolation[] = [];

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      violations.push(...collectConfigViolations(entry, [...path, index]));
    });
    return violations;
  }

  if (!isRecord(value)) {
    if (containsRawSecretMaterial(value)) {
      violations.push({
        code: "raw_secret_config_field",
        path,
        message: "raw_secret_config_field: raw secret material cannot be stored in appaloft config",
      });
    }
    return violations;
  }

  for (const [key, entry] of Object.entries(value)) {
    const entryPath = [...path, key];

    if (shouldTreatIdentityField(path, key)) {
      violations.push({
        code: "config_identity_field",
        path: entryPath,
        message: `config_identity_field: ${entryPath.join(".")} must be selected outside the repository config file`,
      });
      continue;
    }

    if (unsupportedConfigFields.has(key)) {
      violations.push({
        code: "unsupported_config_field",
        path: entryPath,
        message: `unsupported_config_field: ${entryPath.join(".")} is not supported in repository config files yet`,
      });
      continue;
    }

    if (shouldTreatSecretField(path, key, entry) || containsRawSecretMaterial(entry)) {
      violations.push({
        code: "raw_secret_config_field",
        path: entryPath,
        message: `raw_secret_config_field: ${entryPath.join(".")} must reference a secret managed outside the repository config file`,
      });
      continue;
    }

    violations.push(...collectConfigViolations(entry, entryPath));
  }

  return violations;
}

function configError(violations: AppaloftDeploymentConfigViolation[]) {
  return {
    success: false as const,
    error: new z.ZodError(
      violations.map((violation) => ({
        code: "custom",
        path: violation.path,
        message: violation.message,
      })),
    ),
  };
}

export function deploymentConfigViolations(input: unknown): AppaloftDeploymentConfigViolation[] {
  return collectConfigViolations(input);
}

export function parseAppaloftDeploymentConfig(input: unknown) {
  const violations = deploymentConfigViolations(input);
  if (violations.length > 0) {
    return configError(violations);
  }

  return appaloftDeploymentConfigSchema.safeParse(input);
}

function isYamlConfigFile(fileName: string): boolean {
  const normalized = fileName.toLowerCase();
  return normalized.endsWith(".yml") || normalized.endsWith(".yaml");
}

function parseConfigText(text: string, fileName: string): unknown {
  return isYamlConfigFile(fileName) ? parseYaml(text) : JSON.parse(text);
}

export function parseAppaloftDeploymentConfigText(text: string, fileName: string) {
  try {
    return parseAppaloftDeploymentConfig(parseConfigText(text, fileName));
  } catch (error) {
    return configError([
      {
        code: "config_parse_error",
        path: [],
        message: `config_parse_error: ${error instanceof Error ? error.message : String(error)}`,
      },
    ]);
  }
}

export const appaloftDeploymentConfigJsonSchema = z.toJSONSchema(appaloftDeploymentConfigSchema);
