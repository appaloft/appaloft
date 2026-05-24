import {
  containsScheduledTaskSecretText,
  domainError,
  err,
  GitRefText,
  ok,
  type Result,
  resourceExposureModes,
  resourceNetworkProtocols,
  runtimePlanStrategies,
  ScheduledTaskCommandIntent,
  ScheduledTaskScheduleExpression,
  ScheduledTaskTimezone,
  SourceEventKindValue,
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
const dependencyKeyPattern = /^[a-z][a-z0-9_-]{0,62}$/;
const storageKeyPattern = dependencyKeyPattern;
const scheduledTaskKeyPattern = dependencyKeyPattern;
const configProfileKeyPattern = dependencyKeyPattern;
const environmentVariableNamePattern = /^[A-Z_][A-Z0-9_]*$/;
const appaloftDeploymentMonitoringSignals = [
  "cpu",
  "memory",
  "disk",
  "inode",
  "docker",
  "network",
] as const;
const appaloftDeploymentMonitoringThresholdMetrics = [
  "containerCpuPercent",
  "loadAverage1m",
  "containerUsedBytes",
  "usedBytes",
  "attributedBytes",
  "used",
  "imageBytes",
  "buildCacheBytes",
  "containerWritableBytes",
  "rxBytes",
  "txBytes",
] as const;
const appaloftDeploymentMonitoringSignalMetrics: Record<
  (typeof appaloftDeploymentMonitoringSignals)[number],
  readonly (typeof appaloftDeploymentMonitoringThresholdMetrics)[number][]
> = {
  cpu: ["containerCpuPercent", "loadAverage1m"],
  memory: ["containerUsedBytes", "usedBytes"],
  disk: ["usedBytes", "attributedBytes"],
  inode: ["used"],
  docker: ["imageBytes", "buildCacheBytes", "containerWritableBytes"],
  network: ["rxBytes", "txBytes"],
};
export const appaloftDeploymentDependencyKinds = [
  "postgres",
  "redis",
  "mysql",
  "clickhouse",
  "object-storage",
  "opensearch",
] as const;
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
const generatedAccessPathPrefixError =
  "config_generated_access_resolution: access.generated.pathPrefix must start with / and must not include query, fragment, control characters, or parent traversal";
const domainRedirectToError =
  "config_domain_resolution: access.domains[].redirectTo must be a domain name without scheme, port, path, or wildcard";
const controlPlaneUrlError =
  "control_plane_config: controlPlane.url must be an http(s) URL without credentials, query, or fragment";
const controlPlaneInstallerUrlError =
  "control_plane_config: controlPlane.install.installerUrl must be an http(s) URL without credentials, query, or fragment";
const sourceRepositoryUrlError =
  "config_source_resolution: source.repository must be a git URL without credentials, query, or fragment";
const previewDomainTemplateError =
  "preview_config: preview.pullRequest.domainTemplate must be a host template using only {preview_id} and {pr_number}";
const storageMountPathError =
  "config_storage_resolution: storage.<key>.mount.path must be an absolute normalized workload path";
const scheduledTaskScheduleError =
  "config_scheduled_task_resolution: scheduledTasks.<key>.schedule must be a safe scheduled task schedule expression";
const scheduledTaskTimezoneError =
  "config_scheduled_task_resolution: scheduledTasks.<key>.timezone must be an IANA timezone";
const scheduledTaskCommandError =
  "config_scheduled_task_resolution: scheduledTasks.<key>.command must be a single-line command intent without secrets";
const autoDeployRefError =
  "config_auto_deploy_resolution: autoDeploy.refs[] must be a safe git ref";
const autoDeployRefsRequiredError =
  "config_auto_deploy_resolution: autoDeploy.refs is required when autoDeploy is enabled";
const dependencyBackupPolicyRequiredError =
  "config_dependency_backup_resolution: dependencies.<key>.backup intervalHours and retentionDays are required when enabled";
const monitoringThresholdRuleRequiredError =
  "config_monitoring_thresholds_resolution: monitoring.thresholds.rules[] requires warning or critical";
const monitoringThresholdCriticalOrderError =
  "config_monitoring_thresholds_resolution: monitoring.thresholds.rules[].critical must be greater than or equal to warning";
const monitoringThresholdMetricError =
  "config_monitoring_thresholds_resolution: monitoring.thresholds.rules[].metric must match signal";
const positiveIntegerSchema = z.number().int().positive();

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
  "taskId",
  "scheduledTaskId",
  "policyId",
  "backupPolicyId",
  "backupId",
  "restorePointId",
  "artifactHandle",
  "artifactId",
  "sourceEvent",
  "sourceEventId",
  "webhookDelivery",
  "webhookDeliveryId",
  "deliveryId",
  "routeId",
  "domainBindingId",
  "certificateId",
  "thresholdPolicyId",
  "monitoringPolicyId",
  "ruleId",
  "scope",
  "scopeId",
  "sampleId",
  "metricSampleId",
  "containerId",
  "runtimeId",
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
  "quota",
  "reservation",
  "reservations",
  "alert",
  "alerts",
  "notification",
  "notifications",
  "billing",
  "metricPayload",
  "rawPayload",
  "hostPath",
  "log",
  "logs",
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

function isSafeGitRepositoryUrl(value: string): boolean {
  const trimmed = value.trim();
  if (/^git@[^:\s]+:[^\s]+$/.test(trimmed)) {
    return !/[?#]/.test(trimmed);
  }

  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:", "ssh:"].includes(parsed.protocol)) {
      return false;
    }

    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      return false;
    }

    return Boolean(parsed.hostname && parsed.pathname && parsed.pathname !== "/");
  } catch {
    return false;
  }
}

export const appaloftDeploymentSourceConfigSchema = z
  .object({
    type: z.literal("git").optional().describe("Repository source kind."),
    repository: nonEmptyStringSchema
      .refine(isSafeGitRepositoryUrl, sourceRepositoryUrlError)
      .optional()
      .describe("Git repository URL to deploy from."),
    baseDirectory: safeRelativePathSchema
      .optional()
      .describe("Relative workspace directory to use as the deployable source root."),
    gitRef: nonEmptyStringSchema.optional().describe("Git ref to record with the source profile."),
    commitSha: nonEmptyStringSchema
      .optional()
      .describe("Immutable git commit SHA to record with the source profile."),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.type === "git" && !value.repository) {
      context.addIssue({
        code: "custom",
        path: ["repository"],
        message: "config_source_resolution: source.repository is required when source.type is git",
      });
    }
  })
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

const appaloftDeploymentRuntimeCommandConfigSchema = z
  .object({
    command: nonEmptyStringSchema,
  })
  .strict();

export const appaloftDeploymentRuntimeConfigSchema = z
  .object({
    type: z.literal("node").optional().describe("Application runtime type shorthand."),
    strategy: z.enum(deploymentMethods).optional().describe("Requested runtime plan strategy."),
    installCommand: nonEmptyStringSchema.optional(),
    buildCommand: nonEmptyStringSchema.optional(),
    startCommand: nonEmptyStringSchema.optional(),
    build: appaloftDeploymentRuntimeCommandConfigSchema.optional(),
    start: appaloftDeploymentRuntimeCommandConfigSchema.optional(),
    name: runtimeNameConfigSchema.optional(),
    publishDirectory: safeRelativePathSchema.optional(),
    dockerfilePath: safeRelativePathSchema.optional(),
    dockerComposeFilePath: safeRelativePathSchema.optional(),
    buildTarget: nonEmptyStringSchema.optional(),
    healthCheckPath: nonEmptyStringSchema.optional(),
    healthCheck: appaloftDeploymentHealthCheckConfigSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.type === "node" && value.strategy && value.strategy !== "workspace-commands") {
      context.addIssue({
        code: "custom",
        path: ["strategy"],
        message: "runtime.type node requires runtime.strategy workspace-commands when both are set",
      });
    }

    if (
      value.buildCommand &&
      value.build?.command &&
      value.buildCommand.trim() !== value.build.command.trim()
    ) {
      context.addIssue({
        code: "custom",
        path: ["build", "command"],
        message: "runtime.build.command must match runtime.buildCommand when both are set",
      });
    }

    if (
      value.startCommand &&
      value.start?.command &&
      value.startCommand.trim() !== value.start.command.trim()
    ) {
      context.addIssue({
        code: "custom",
        path: ["start", "command"],
        message: "runtime.start.command must match runtime.startCommand when both are set",
      });
    }
  })
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

const runtimePruneCategorySchema = z.enum([
  "stopped-containers",
  "preview-workspaces",
  "source-workspaces",
  "docker-build-cache",
  "unused-images",
  "remote-state-markers",
]);

export const appaloftDeploymentRetentionConfigSchema = z
  .object({
    runtimePrune: z
      .object({
        retentionDays: positiveIntegerSchema,
        destructive: z.boolean().default(false),
        categories: z.array(runtimePruneCategorySchema).min(1).default(["stopped-containers"]),
        retryOnFailure: z.boolean().default(true),
        enabled: z.boolean().default(true),
      })
      .strict()
      .optional(),
  })
  .strict()
  .describe("Safe retention policy fields materialized during deployment config bootstrap.");

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

function normalizeAbsoluteWorkloadPath(value: string): string {
  const segments = value.trim().split("/").filter(Boolean);
  return `/${segments.join("/")}`;
}

function isSafeStorageMountPath(value: string): boolean {
  const trimmed = value.trim();
  if (
    !trimmed ||
    /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ||
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    /^[a-z]:[\\/]/i.test(trimmed) ||
    /[;&|`$<>]/.test(trimmed)
  ) {
    return false;
  }

  const segments = trimmed.split("/").filter(Boolean);
  return segments.length > 0 && !segments.some((segment) => segment === "." || segment === "..");
}

function isSafeScheduledTaskSchedule(value: string): boolean {
  return ScheduledTaskScheduleExpression.create(value).isOk();
}

function isSafeScheduledTaskTimezone(value: string): boolean {
  return ScheduledTaskTimezone.create(value).isOk();
}

function isSafeScheduledTaskCommand(value: string): boolean {
  return ScheduledTaskCommandIntent.create(value).isOk() && !containsScheduledTaskSecretText(value);
}

function isSafeAutoDeployRef(value: string): boolean {
  return GitRefText.create(value).isOk();
}

function isSafeAutoDeployEvent(value: string): boolean {
  return SourceEventKindValue.create(value).isOk();
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

const appaloftDeploymentGeneratedAccessConfigSchema = z
  .object({
    enabled: z.boolean().optional().default(true),
    pathPrefix: nonEmptyStringSchema
      .optional()
      .default("/")
      .pipe(z.string().refine(isSafeDomainPathPrefix, generatedAccessPathPrefixError)),
  })
  .strict()
  .describe("Resource generated access profile intent.");

export const appaloftDeploymentAccessConfigSchema = z
  .object({
    domains: z.array(appaloftDeploymentAccessDomainConfigSchema).min(1).optional(),
    generated: appaloftDeploymentGeneratedAccessConfigSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const domains = value.domains ?? [];
    if (domains.length === 0 && !value.generated) {
      context.addIssue({
        code: "custom",
        path: ["domains"],
        message: "config_domain_resolution: access requires domains or generated",
      });
      return;
    }

    const byHost = new Map<string, NonNullable<typeof value.domains>[number]>();
    for (const domain of domains) {
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

    for (const domain of domains) {
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

function isSafePreviewDomainTemplate(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  if (
    trimmed.length > 253 ||
    trimmed.includes("://") ||
    trimmed.includes("/") ||
    trimmed.includes(":") ||
    trimmed.includes("*") ||
    trimmed.includes("${{") ||
    trimmed.includes("}}") ||
    trimmed.endsWith(".")
  ) {
    return false;
  }

  const rendered = trimmed
    .replaceAll("{preview_id}", "preview-123")
    .replaceAll("{pr_number}", "123");
  if (/[{}]/.test(rendered)) {
    return false;
  }

  return isDomainName(rendered);
}

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

export const appaloftDeploymentDependencyBackupConfigSchema = z
  .object({
    enabled: z.boolean().optional().default(true),
    intervalHours: z.number().int().min(1).max(8_760).optional(),
    retentionDays: z.number().int().min(1).max(3_650).optional(),
    retryOnFailure: z.boolean().optional().default(true),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.enabled && (!value.intervalHours || !value.retentionDays)) {
      context.addIssue({
        code: "custom",
        path: ["intervalHours"],
        message: dependencyBackupPolicyRequiredError,
      });
    }
  })
  .describe("User-facing dependency resource scheduled backup policy declaration.");

export const appaloftDeploymentDependencyConfigSchema = z
  .object({
    kind: z.enum(appaloftDeploymentDependencyKinds).describe("Application dependency kind."),
    source: z.literal("managed").describe("Managed dependencies are created by Appaloft."),
    bind: z
      .object({
        env: nonEmptyStringSchema
          .regex(
            environmentVariableNamePattern,
            "config_dependency_resolution: dependencies.<key>.bind.env must be an environment variable name",
          )
          .describe("Runtime environment variable target for this dependency."),
      })
      .strict(),
    backup: appaloftDeploymentDependencyBackupConfigSchema.optional(),
    preview: z
      .object({
        lifecycle: z.literal("ephemeral").optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .describe("User-facing application dependency declaration.");

export const appaloftDeploymentStorageConfigSchema = z
  .object({
    kind: z.literal("volume").describe("Application storage dependency kind."),
    source: z.literal("managed").describe("Managed storage volumes are created by Appaloft."),
    mount: z
      .object({
        path: nonEmptyStringSchema
          .refine(isSafeStorageMountPath, storageMountPathError)
          .describe("Absolute workload path that receives this storage volume."),
        mode: z.enum(["read-write", "read-only"]).optional().default("read-write"),
      })
      .strict(),
    preview: z
      .object({
        lifecycle: z.literal("ephemeral").optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .describe("User-facing application storage declaration.");

export const appaloftDeploymentScheduledTaskConfigSchema = z
  .object({
    schedule: nonEmptyStringSchema
      .refine(isSafeScheduledTaskSchedule, scheduledTaskScheduleError)
      .describe("Safe scheduled task schedule expression."),
    timezone: nonEmptyStringSchema
      .refine(isSafeScheduledTaskTimezone, scheduledTaskTimezoneError)
      .optional()
      .default("UTC"),
    command: nonEmptyStringSchema
      .refine(isSafeScheduledTaskCommand, scheduledTaskCommandError)
      .describe("Single-line scheduled task command intent."),
    timeoutSeconds: z.number().int().min(1).max(86_400).optional().default(3_600),
    retryLimit: z.number().int().min(0).max(10).optional().default(0),
    concurrencyPolicy: z.enum(["forbid"]).optional().default("forbid"),
    status: z.enum(["enabled", "disabled"]).optional().default("enabled"),
    preview: z
      .object({
        lifecycle: z.literal("ephemeral").optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .describe("User-facing Resource scheduled task declaration.");

export const appaloftDeploymentAutoDeployConfigSchema = z
  .object({
    enabled: z.boolean().optional().default(true),
    trigger: z.literal("git-push").optional().default("git-push"),
    refs: z
      .array(nonEmptyStringSchema.refine(isSafeAutoDeployRef, autoDeployRefError))
      .min(1)
      .optional(),
    events: z
      .array(z.enum(["push", "tag"]).refine(isSafeAutoDeployEvent))
      .min(1)
      .optional()
      .default(["push"]),
    dedupeWindowSeconds: z.number().int().positive().max(86_400).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.enabled && (!value.refs || value.refs.length === 0)) {
      context.addIssue({
        code: "custom",
        path: ["refs"],
        message: autoDeployRefsRequiredError,
      });
    }
  })
  .describe("User-facing Resource auto-deploy policy declaration.");

const appaloftDeploymentMonitoringThresholdRuleConfigSchema = z
  .object({
    signal: z.enum(appaloftDeploymentMonitoringSignals),
    metric: z.enum(appaloftDeploymentMonitoringThresholdMetrics),
    warning: z.number().finite().nonnegative().optional(),
    critical: z.number().finite().nonnegative().optional(),
    comparator: z.literal("greater-than-or-equal").optional().default("greater-than-or-equal"),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.warning === undefined && value.critical === undefined) {
      context.addIssue({
        code: "custom",
        path: ["warning"],
        message: monitoringThresholdRuleRequiredError,
      });
    }
    if (
      value.warning !== undefined &&
      value.critical !== undefined &&
      value.critical < value.warning
    ) {
      context.addIssue({
        code: "custom",
        path: ["critical"],
        message: monitoringThresholdCriticalOrderError,
      });
    }
    if (!appaloftDeploymentMonitoringSignalMetrics[value.signal].includes(value.metric)) {
      context.addIssue({
        code: "custom",
        path: ["metric"],
        message: monitoringThresholdMetricError,
      });
    }
  })
  .describe("Resource runtime monitoring threshold rule.");

export const appaloftDeploymentMonitoringConfigSchema = z
  .object({
    thresholds: z
      .object({
        enabled: z.boolean().optional().default(true),
        rules: z.array(appaloftDeploymentMonitoringThresholdRuleConfigSchema).min(1),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.thresholds) {
      context.addIssue({
        code: "custom",
        path: ["thresholds"],
        message: "config_monitoring_thresholds_resolution: monitoring requires thresholds",
      });
    }
  })
  .describe("Resource runtime monitoring config declarations.");

const appaloftDeploymentPreviewAccessProfileConfigSchema = z
  .object({
    generated: appaloftDeploymentGeneratedAccessConfigSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.generated) {
      context.addIssue({
        code: "custom",
        path: ["generated"],
        message: "preview_config: preview.pullRequest.profile.access requires generated",
      });
    }
  })
  .describe("Preview profile access overlay fields.");

export const appaloftDeploymentPreviewProfileConfigSchema = z
  .object({
    runtime: appaloftDeploymentRuntimeConfigSchema.optional(),
    network: appaloftDeploymentNetworkConfigSchema.optional(),
    health: appaloftDeploymentHealthCheckConfigSchema.optional(),
    access: appaloftDeploymentPreviewAccessProfileConfigSchema.optional(),
    monitoring: appaloftDeploymentMonitoringConfigSchema.optional(),
    env: z.record(z.string(), nonSecretEnvironmentValueSchema).optional(),
    secrets: z.record(z.string(), appaloftDeploymentSecretReferenceSchema).optional(),
  })
  .strict()
  .describe("Selected PR preview profile overlay fields.");

export const appaloftDeploymentNamedProfileConfigSchema = z
  .object({
    runtime: appaloftDeploymentRuntimeConfigSchema.optional(),
    network: appaloftDeploymentNetworkConfigSchema.optional(),
    health: appaloftDeploymentHealthCheckConfigSchema.optional(),
    access: appaloftDeploymentAccessConfigSchema.optional(),
    monitoring: appaloftDeploymentMonitoringConfigSchema.optional(),
    env: z.record(z.string(), nonSecretEnvironmentValueSchema).optional(),
    secrets: z.record(z.string(), appaloftDeploymentSecretReferenceSchema).optional(),
  })
  .strict()
  .describe("Trusted-entrypoint-selected named config profile overlay fields.");

export const appaloftDeploymentPreviewConfigSchema = z
  .object({
    pullRequest: z
      .object({
        domainTemplate: nonEmptyStringSchema
          .refine(isSafePreviewDomainTemplate, previewDomainTemplateError)
          .optional(),
        tlsMode: z.enum(["auto", "disabled"]).optional(),
        profile: appaloftDeploymentPreviewProfileConfigSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .describe("Preview deployment policy read by trusted entrypoints such as GitHub Actions.");

function isSafeControlPlaneUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }

    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      return false;
    }

    return parsed.pathname === "" || parsed.pathname === "/";
  } catch {
    return false;
  }
}

function isSafeHttpUrlWithoutCredentials(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }

    return !parsed.username && !parsed.password && !parsed.search && !parsed.hash;
  } catch {
    return false;
  }
}

export const appaloftDeploymentControlPlaneConfigSchema = z
  .object({
    mode: z.enum(["none", "auto", "cloud", "self-hosted"]),
    url: nonEmptyStringSchema.refine(isSafeControlPlaneUrl, controlPlaneUrlError).optional(),
    deploymentContext: z
      .object({
        projectId: nonEmptyStringSchema,
        environmentId: nonEmptyStringSchema,
        resourceId: nonEmptyStringSchema,
        serverId: nonEmptyStringSchema,
        destinationId: nonEmptyStringSchema.optional(),
      })
      .strict()
      .optional()
      .describe(
        "Non-secret deployment identity for explicitly bootstrapping or relinking this repository to an Appaloft server context.",
      ),
    install: z
      .object({
        url: nonEmptyStringSchema.refine(isSafeControlPlaneUrl, controlPlaneUrlError).optional(),
        domain: nonEmptyStringSchema.optional(),
        database: z.enum(["postgres", "pglite"]).optional(),
        orchestrator: z.enum(["compose", "swarm"]).optional(),
        proxy: z.enum(["traefik", "none"]).optional(),
        httpHost: nonEmptyStringSchema.optional(),
        httpPort: positiveIntegerSchema.optional(),
        installDir: nonEmptyStringSchema.optional(),
        composeProjectName: nonEmptyStringSchema.optional(),
        swarmStackName: nonEmptyStringSchema.optional(),
        swarmInit: z.boolean().optional(),
        swarmAdvertiseAddr: nonEmptyStringSchema.optional(),
        image: nonEmptyStringSchema.optional(),
        installerUrl: nonEmptyStringSchema
          .refine(isSafeHttpUrlWithoutCredentials, controlPlaneInstallerUrlError)
          .optional(),
        skipDockerInstall: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.mode === "self-hosted" && !value.url) {
      context.addIssue({
        code: "custom",
        path: ["url"],
        message: "control_plane_config: controlPlane.url is required when mode is self-hosted",
      });
    }

    if ((value.mode === "none" || value.mode === "auto") && value.url) {
      context.addIssue({
        code: "custom",
        path: ["url"],
        message: "control_plane_config: controlPlane.url requires mode self-hosted or cloud",
      });
    }
  })
  .describe(
    "Non-secret control-plane connection policy. Identity and secrets stay outside config.",
  );

export const appaloftDeploymentConfigSchema = z
  .object({
    $schema: z.string().trim().min(1).optional(),
    controlPlane: appaloftDeploymentControlPlaneConfigSchema.optional(),
    source: appaloftDeploymentSourceConfigSchema.optional(),
    runtime: appaloftDeploymentRuntimeConfigSchema.optional(),
    network: appaloftDeploymentNetworkConfigSchema.optional(),
    retention: appaloftDeploymentRetentionConfigSchema.optional(),
    health: appaloftDeploymentHealthCheckConfigSchema.optional(),
    access: appaloftDeploymentAccessConfigSchema.optional(),
    monitoring: appaloftDeploymentMonitoringConfigSchema.optional(),
    preview: appaloftDeploymentPreviewConfigSchema.optional(),
    profiles: z
      .record(
        z
          .string()
          .regex(
            configProfileKeyPattern,
            "config_profile_resolution: profile keys must start with a lowercase letter and contain only lowercase letters, digits, dash, or underscore",
          ),
        appaloftDeploymentNamedProfileConfigSchema,
      )
      .optional(),
    dependencies: z
      .record(
        z
          .string()
          .regex(
            dependencyKeyPattern,
            "config_dependency_resolution: dependency keys must start with a lowercase letter and contain only lowercase letters, digits, dash, or underscore",
          ),
        appaloftDeploymentDependencyConfigSchema,
      )
      .optional(),
    storage: z
      .record(
        z
          .string()
          .regex(
            storageKeyPattern,
            "config_storage_resolution: storage keys must start with a lowercase letter and contain only lowercase letters, digits, dash, or underscore",
          ),
        appaloftDeploymentStorageConfigSchema,
      )
      .optional(),
    scheduledTasks: z
      .record(
        z
          .string()
          .regex(
            scheduledTaskKeyPattern,
            "config_scheduled_task_resolution: scheduled task keys must start with a lowercase letter and contain only lowercase letters, digits, dash, or underscore",
          ),
        appaloftDeploymentScheduledTaskConfigSchema,
      )
      .optional(),
    autoDeploy: appaloftDeploymentAutoDeployConfigSchema.optional(),
    env: z.record(z.string(), nonSecretEnvironmentValueSchema).optional(),
    secrets: z.record(z.string(), appaloftDeploymentSecretReferenceSchema).optional(),
  })
  .strict()
  .describe("Appaloft repository deployment profile config file.");

export type AppaloftDeploymentConfigInput = z.input<typeof appaloftDeploymentConfigSchema>;
export type AppaloftDeploymentConfig = z.output<typeof appaloftDeploymentConfigSchema>;

type AppaloftDeploymentConfigProfileOverlay = Pick<
  Partial<AppaloftDeploymentConfig>,
  "runtime" | "network" | "health" | "access" | "monitoring" | "env" | "secrets"
>;

function applyAppaloftDeploymentProfileOverlay(
  config: AppaloftDeploymentConfig,
  profile: AppaloftDeploymentConfigProfileOverlay,
): AppaloftDeploymentConfig {
  return normalizeDeploymentConfig({
    ...config,
    ...(profile.runtime ? { runtime: { ...config.runtime, ...profile.runtime } } : {}),
    ...(profile.network ? { network: { ...config.network, ...profile.network } } : {}),
    ...(profile.health ? { health: { ...config.health, ...profile.health } } : {}),
    ...(profile.access ? { access: { ...config.access, ...profile.access } } : {}),
    ...(profile.monitoring ? { monitoring: { ...config.monitoring, ...profile.monitoring } } : {}),
    ...(profile.env ? { env: { ...config.env, ...profile.env } } : {}),
    ...(profile.secrets ? { secrets: { ...config.secrets, ...profile.secrets } } : {}),
  });
}

export function applyAppaloftDeploymentConfigProfile(
  config: AppaloftDeploymentConfig,
  profileName: string,
): Result<AppaloftDeploymentConfig> {
  const normalizedProfileName = profileName.trim();
  if (!configProfileKeyPattern.test(normalizedProfileName)) {
    return err(
      domainError.validation("Deployment config profile key is invalid", {
        phase: "config-profile-resolution",
        profile: normalizedProfileName,
      }),
    );
  }

  const profile = config.profiles?.[normalizedProfileName];
  if (!profile) {
    return err(
      domainError.validation("Deployment config profile was not found", {
        phase: "config-profile-resolution",
        profile: normalizedProfileName,
      }),
    );
  }

  return ok(applyAppaloftDeploymentProfileOverlay(config, profile));
}

export function applyAppaloftDeploymentPreviewProfile(
  config: AppaloftDeploymentConfig,
): AppaloftDeploymentConfig {
  const profile = config.preview?.pullRequest?.profile;
  if (!profile) {
    return config;
  }

  return applyAppaloftDeploymentProfileOverlay(config, profile);
}

function normalizeDeploymentConfig(config: AppaloftDeploymentConfig): AppaloftDeploymentConfig {
  return {
    ...config,
    ...(config.controlPlane?.url
      ? {
          controlPlane: {
            ...config.controlPlane,
            url: config.controlPlane.url.replace(/\/+$/, ""),
          },
        }
      : {}),
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
            ...(config.access.domains
              ? {
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
                }
              : {}),
            ...(config.access.generated ? { generated: config.access.generated } : {}),
          },
        }
      : {}),
    ...(config.storage
      ? {
          storage: Object.fromEntries(
            Object.entries(config.storage).map(([key, storage]) => [
              key,
              {
                ...storage,
                mount: {
                  ...storage.mount,
                  path: normalizeAbsoluteWorkloadPath(storage.mount.path),
                },
              },
            ]),
          ),
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
  if (root === "controlPlane" && path[1] === "deploymentContext") {
    return false;
  }
  return (
    root === "runtime" ||
    root === "deployment" ||
    root === "network" ||
    root === "source" ||
    root === "access" ||
    root === "dependencies" ||
    root === "storage" ||
    root === "scheduledTasks" ||
    root === "autoDeploy" ||
    root === "monitoring" ||
    root === "profiles" ||
    root === "controlPlane"
  );
}

function isAllowedSecretReference(path: (string | number)[], value: unknown): boolean {
  return (
    path.length >= 2 &&
    path[path.length - 2] === "secrets" &&
    isRecord(value) &&
    typeof value.from === "string" &&
    value.from.trim().length > 0
  );
}

function shouldTreatSecretField(path: (string | number)[], key: string, value: unknown): boolean {
  if (key === "secrets" && isRecord(value)) {
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
