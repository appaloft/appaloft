import {
  domainError,
  err,
  ok,
  type Result,
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
const runtimeNameIdentifierPattern = /^[a-z0-9](?:[a-z0-9_.-]{0,61}[a-z0-9])?$/;
const runtimeNameTemplateTokenPattern = /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g;
export const appaloftDeploymentRuntimeNameTemplateVariables = ["preview_id", "pr_number"] as const;
type AppaloftDeploymentRuntimeNameTemplateVariable =
  (typeof appaloftDeploymentRuntimeNameTemplateVariables)[number];
const runtimeNameTemplateVariableLookup = new Map(
  appaloftDeploymentRuntimeNameTemplateVariables.map((value) => [value.toLowerCase(), value]),
);
const safeRelativePathSchema = nonEmptyStringSchema.regex(
  safeRelativePathPattern,
  "Path must be relative to the selected source root and must not escape it",
);
const domainLabelPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const domainHostError =
  "config_domain_resolution: access.domains[].host must be a domain name without scheme, port, path, or wildcard";
const domainPathPrefixError =
  "config_domain_resolution: access.domains[].pathPrefix must start with / and must not include query, fragment, control characters, or parent traversal";
const domainRedirectToError =
  "config_domain_resolution: access.domains[].redirectTo must be a domain name without scheme, port, path, or wildcard";

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
  "providerAccount",
  "providerAccountId",
  "certificateProvider",
  "certificateProviderId",
  "certificateProviderAccount",
  "certificateProviderAccountId",
  "dnsProvider",
  "dnsProviderId",
  "dnsProviderAccount",
  "dnsProviderAccountId",
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
  "namespace",
  "stack",
  "service",
  "serviceName",
  "replicas",
  "scale",
  "updatePolicy",
  "autoscaling",
  "restartPolicy",
  "rollout",
  "deploymentStrategy",
  "registrySecret",
  "pullSecret",
  "ingress",
  "manifest",
  "manifests",
  "swarm",
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

function normalizeRuntimeNameTemplateVariable(
  value: string,
): AppaloftDeploymentRuntimeNameTemplateVariable | null {
  return runtimeNameTemplateVariableLookup.get(value.toLowerCase()) ?? null;
}

function hasValidRuntimeNameTemplateSyntax(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) {
    return false;
  }

  let valid = true;
  const substituted = normalized.replace(runtimeNameTemplateTokenPattern, (_, token: string) => {
    if (!normalizeRuntimeNameTemplateVariable(token)) {
      valid = false;
    }

    return "a";
  });

  return valid && !/[{}]/.test(substituted) && runtimeNameIdentifierPattern.test(substituted);
}

const runtimeNameConfigSchema = nonEmptyStringSchema.refine(
  (value) => hasValidRuntimeNameTemplateSyntax(value.toLowerCase()),
  "runtime.name must be a safe normalized identifier or a template using {preview_id} and {pr_number}",
);

export interface AppaloftDeploymentRuntimeNameTemplateContext {
  preview_id?: string;
  pr_number?: string | number;
}

export function renderAppaloftDeploymentRuntimeNameTemplate(input: {
  template: string;
  context?: AppaloftDeploymentRuntimeNameTemplateContext;
}): Result<string> {
  const normalizedTemplate = input.template.trim().toLowerCase();
  let missingVariable: AppaloftDeploymentRuntimeNameTemplateVariable | undefined;

  const rendered = normalizedTemplate.replace(
    runtimeNameTemplateTokenPattern,
    (_, rawToken: string) => {
      const token = normalizeRuntimeNameTemplateVariable(rawToken);
      if (!token) {
        missingVariable = undefined;
        return "";
      }

      if (token === "preview_id") {
        const previewId = input.context?.preview_id?.trim().toLowerCase();
        if (!previewId) {
          missingVariable = token;
          return "";
        }

        return previewId;
      }

      const prNumber = input.context?.pr_number;
      const normalizedPrNumber =
        prNumber === undefined || prNumber === null ? "" : String(prNumber).trim().toLowerCase();
      if (!normalizedPrNumber) {
        missingVariable = token;
        return "";
      }

      return normalizedPrNumber;
    },
  );

  if (/[{}]/.test(rendered)) {
    return err(
      domainError.validation("runtime.name template includes unsupported variables", {
        phase: "config-template-resolution",
        field: "runtime.name",
      }),
    );
  }

  if (missingVariable) {
    return err(
      domainError.validation("runtime.name template requires preview context", {
        phase: "config-template-resolution",
        field: "runtime.name",
        variable: missingVariable,
      }),
    );
  }

  if (!runtimeNameIdentifierPattern.test(rendered)) {
    return err(
      domainError.validation("Rendered runtime.name is not a safe normalized identifier", {
        phase: "config-template-resolution",
        field: "runtime.name",
      }),
    );
  }

  return ok(rendered);
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
    name: runtimeNameConfigSchema.optional(),
    publishDirectory: safeRelativePathSchema.optional(),
    dockerfilePath: safeRelativePathSchema.optional(),
    dockerComposeFilePath: safeRelativePathSchema.optional(),
    buildTarget: nonEmptyStringSchema.optional(),
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

function isDomainName(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  if (
    normalized.length > 253 ||
    normalized.includes("://") ||
    normalized.includes("/") ||
    normalized.includes(":") ||
    normalized.includes("*") ||
    normalized.endsWith(".")
  ) {
    return false;
  }

  const labels = normalized.split(".");
  if (labels.length < 2) {
    return false;
  }

  return labels.every((label) => domainLabelPattern.test(label));
}

function isSafeDomainPathPrefix(value: string): boolean {
  const normalized = value.trim();

  return (
    normalized.startsWith("/") &&
    !normalized.startsWith("//") &&
    !normalized.includes("..") &&
    !hasUnsafePathPrefixCharacter(normalized)
  );
}

function hasUnsafePathPrefixCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (character === "?" || character === "#" || code <= 32 || code === 127) {
      return true;
    }
  }

  return false;
}

const appaloftDeploymentAccessDomainConfigSchema = z
  .object({
    host: nonEmptyStringSchema.refine(
      (value) => isDomainName(value.toLowerCase()),
      domainHostError,
    ),
    pathPrefix: nonEmptyStringSchema
      .optional()
      .default("/")
      .pipe(z.string().refine(isSafeDomainPathPrefix, domainPathPrefixError)),
    tlsMode: z.enum(["auto", "disabled"]).optional().default("auto"),
    redirectTo: nonEmptyStringSchema
      .refine((value) => isDomainName(value.toLowerCase()), domainRedirectToError)
      .optional(),
    redirectStatus: z
      .union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)])
      .optional(),
  })
  .strict()
  .describe("Provider-neutral server-applied domain intent.");

export const appaloftDeploymentAccessConfigSchema = z
  .object({
    domains: z.array(appaloftDeploymentAccessDomainConfigSchema).min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const byHost = new Map<string, (typeof value.domains)[number]>();
    for (const domain of value.domains) {
      const existing = byHost.get(domain.host);
      if (existing) {
        context.addIssue({
          code: "custom",
          path: ["domains"],
          message: "config_domain_resolution: access.domains[] cannot contain duplicate hosts",
        });
        return;
      }
      byHost.set(domain.host, domain);
    }

    for (const domain of value.domains) {
      if (domain.redirectStatus && !domain.redirectTo) {
        context.addIssue({
          code: "custom",
          path: ["domains"],
          message: "config_domain_resolution: access.domains[].redirectStatus requires redirectTo",
        });
        return;
      }

      if (!domain.redirectTo) {
        continue;
      }

      const target = byHost.get(domain.redirectTo);
      if (!target) {
        context.addIssue({
          code: "custom",
          path: ["domains"],
          message:
            "config_domain_resolution: canonical redirect target must exist in access.domains[]",
        });
        return;
      }

      if (target.host === domain.host) {
        context.addIssue({
          code: "custom",
          path: ["domains"],
          message: "config_domain_resolution: canonical redirect cannot point to itself",
        });
        return;
      }

      if (target.redirectTo) {
        context.addIssue({
          code: "custom",
          path: ["domains"],
          message:
            "config_domain_resolution: canonical redirect target must be a served domain, not another redirect",
        });
        return;
      }
    }
  })
  .describe("Access intent resolved outside deployments.create.");

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
    access: appaloftDeploymentAccessConfigSchema.optional(),
    env: z.record(z.string(), nonSecretEnvironmentValueSchema).optional(),
    secrets: z.record(z.string(), appaloftDeploymentSecretReferenceSchema).optional(),
  })
  .strict()
  .describe("Appaloft repository deployment profile config file.");

export type AppaloftDeploymentConfigInput = z.input<typeof appaloftDeploymentConfigSchema>;
export type AppaloftDeploymentConfig = z.output<typeof appaloftDeploymentConfigSchema>;

function normalizeDeploymentConfig(config: AppaloftDeploymentConfig): AppaloftDeploymentConfig {
  return {
    ...config,
    ...(config.runtime?.name
      ? {
          runtime: {
            ...config.runtime,
            name: config.runtime.name.toLowerCase(),
          },
        }
      : {}),
    ...(config.access
      ? {
          access: {
            domains: config.access.domains.map((domain) => {
              const normalizedDomain = {
                ...domain,
                host: domain.host.toLowerCase(),
                ...(domain.redirectTo ? { redirectTo: domain.redirectTo.toLowerCase() } : {}),
              };

              return normalizedDomain.redirectTo && !normalizedDomain.redirectStatus
                ? {
                    ...normalizedDomain,
                    redirectStatus: 308,
                  }
                : normalizedDomain;
            }),
          },
        }
      : {}),
  };
}

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
  return (
    root === "runtime" ||
    root === "deployment" ||
    root === "network" ||
    root === "source" ||
    root === "access"
  );
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

  const parsed = appaloftDeploymentConfigSchema.safeParse(input);
  if (!parsed.success) {
    return parsed;
  }

  return {
    success: true as const,
    data: normalizeDeploymentConfig(parsed.data),
  };
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
