import { type MigrationBundle, parseMigrationBundle } from "@appaloft/application";
import { domainError, err, type Result } from "@appaloft/core";
import { z } from "zod";

const railwayVariableSchema = z
  .object({
    key: z.string().trim().min(1),
    value: z.string().optional(),
    secretRef: z.string().trim().min(1).optional(),
    exposure: z.enum(["build-time", "runtime"]),
    secret: z.boolean().default(false),
  })
  .strict()
  .superRefine((variable, context) => {
    if (variable.secret && (variable.value !== undefined || variable.secretRef === undefined)) {
      context.addIssue({
        code: "custom",
        path: ["secretRef"],
        message: "Railway secret variables require secretRef and cannot contain plaintext",
      });
      return;
    }
    if ((variable.value === undefined) === (variable.secretRef === undefined)) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "Railway variables require exactly one of value or secretRef",
      });
    }
  });

const railwayServiceSchema = z
  .object({
    ref: z.string().regex(/^[a-z][a-z0-9-]*$/),
    name: z.string().trim().min(1),
    source: z
      .object({
        repositoryUrl: z.string().trim().min(1).optional(),
        branch: z.string().trim().min(1).optional(),
        rootDirectory: z.string().trim().min(1).optional(),
        image: z.string().trim().min(1).optional(),
        imageDigest: z.string().trim().min(1).optional(),
      })
      .strict()
      .superRefine((source, context) => {
        if ((source.repositoryUrl === undefined) === (source.image === undefined)) {
          context.addIssue({
            code: "custom",
            path: ["repositoryUrl"],
            message: "Railway service source requires exactly one repositoryUrl or image",
          });
        }
      }),
    build: z
      .object({
        builder: z.enum(["railpack", "nixpacks", "dockerfile"]),
        buildCommand: z.string().trim().min(1).optional(),
        dockerfilePath: z.string().trim().min(1).optional(),
      })
      .strict()
      .optional(),
    deploy: z
      .object({
        startCommand: z.string().trim().min(1).optional(),
        healthcheckPath: z.string().trim().min(1).optional(),
        port: z.number().int().positive().max(65535).optional(),
        replicas: z.number().int().positive().optional(),
        cronSchedule: z.string().trim().min(1).optional(),
      })
      .strict()
      .optional(),
    variables: z.array(railwayVariableSchema).default([]),
    domains: z
      .array(
        z
          .object({
            hostname: z.string().trim().min(1),
            tlsPolicy: z.enum(["automatic", "manual", "disabled"]).default("automatic"),
          })
          .strict(),
      )
      .default([]),
    volumes: z
      .array(
        z
          .object({
            ref: z.string().regex(/^[a-z][a-z0-9-]*$/),
            name: z.string().trim().min(1),
            mountPath: z.string().trim().min(1),
            sizeMb: z.number().int().positive().optional(),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();

export const railwayMigrationSourceSchema = z
  .object({
    apiVersion: z.literal("railway.appaloft.io/export/v1"),
    kind: z.literal("RailwayProjectExport"),
    metadata: z
      .object({
        name: z.string().trim().min(1),
        projectId: z.string().trim().min(1).optional(),
      })
      .strict(),
    environment: z
      .object({
        name: z.string().trim().min(1),
        kind: z.enum(["development", "preview", "staging", "production"]),
      })
      .strict(),
    target: z
      .object({
        deploymentTargetId: z.string().trim().min(1),
        destinationId: z.string().trim().min(1).optional(),
      })
      .strict(),
    services: z.array(railwayServiceSchema).min(1),
    dependencies: z
      .array(
        z
          .object({
            ref: z.string().regex(/^[a-z][a-z0-9-]*$/),
            name: z.string().trim().min(1),
            kind: z.enum(["postgres", "mysql", "redis", "mongodb", "clickhouse", "generic"]),
            providerKey: z.string().trim().min(1),
            connectionSecretRef: z.string().trim().min(1).optional(),
            bindings: z
              .array(
                z
                  .object({
                    serviceRef: z.string().regex(/^[a-z][a-z0-9-]*$/),
                    targetName: z.string().trim().min(1),
                    scope: z.enum(["runtime-only", "build-and-runtime"]).default("runtime-only"),
                    injectionMode: z.enum(["env", "file"]).default("env"),
                  })
                  .strict(),
              )
              .default([]),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();

export type RailwayMigrationSource = z.output<typeof railwayMigrationSourceSchema>;

function railwayValidationError(error: z.ZodError): ReturnType<typeof domainError.validation> {
  return domainError.validation("Railway migration export validation failed", {
    phase: "railway-migration-source-validation",
    issues: error.issues.map(
      (issue) => `${issue.path.join(".") || "root"}: ${issue.code}: ${issue.message}`,
    ),
  });
}

export function translateRailwayMigrationSource(input: unknown): Result<MigrationBundle> {
  const parsed = railwayMigrationSourceSchema.safeParse(input);
  if (!parsed.success) return err(railwayValidationError(parsed.error));
  const source = parsed.data;
  const sourceBlockers = source.services.flatMap((service, index) => {
    const blockers: Array<{ code: string; path: string; message: string }> = [];
    if (service.deploy?.cronSchedule) {
      blockers.push({
        code: "railway_cron_requires_scheduled_task_mapping",
        path: `services.${index}.deploy.cronSchedule`,
        message: `Service ${service.ref} cron schedule requires an explicit ScheduledTask mapping.`,
      });
    }
    if ((service.deploy?.replicas ?? 1) > 1) {
      blockers.push({
        code: "railway_replicas_require_scale_profile",
        path: `services.${index}.deploy.replicas`,
        message: `Service ${service.ref} replicas require the R5 scale profile.`,
      });
    }
    return blockers;
  });

  return parseMigrationBundle({
    apiVersion: "appaloft.io/migration/v1",
    kind: "MigrationBundle",
    metadata: {
      name: source.metadata.name,
      source: { provider: "railway" },
    },
    spec: {
      project: { name: source.metadata.name },
      environment: source.environment,
      target: source.target,
      resources: source.services.map((service) => ({
        ref: service.ref,
        name: service.name,
        kind: "application" as const,
        source: service.source.repositoryUrl
          ? {
              kind: "remote-git" as const,
              locator: service.source.repositoryUrl,
              gitRef: service.source.branch,
              baseDirectory: service.source.rootDirectory,
            }
          : {
              kind: "docker-image" as const,
              locator: service.source.image ?? "",
              imageDigest: service.source.imageDigest,
            },
        runtime: {
          strategy: service.build?.builder === "dockerfile" ? "dockerfile" : "auto",
          buildCommand: service.build?.buildCommand,
          dockerfilePath: service.build?.dockerfilePath,
          startCommand: service.deploy?.startCommand,
          healthCheckPath: service.deploy?.healthcheckPath,
        },
        network: service.deploy?.port
          ? { internalPort: service.deploy.port, upstreamProtocol: "http" as const }
          : undefined,
      })),
      variables: source.services.flatMap((service) =>
        service.variables.map((variable) => ({
          key: variable.key,
          value: variable.value,
          secretRef: variable.secretRef,
          exposure: variable.exposure,
          kind: variable.secret ? ("secret" as const) : ("plain-config" as const),
          resourceRef: service.ref,
        })),
      ),
      dependencies: source.dependencies.map((dependency) => ({
        ref: dependency.ref,
        name: dependency.name,
        kind: dependency.kind,
        sourceMode: dependency.connectionSecretRef
          ? ("imported-external" as const)
          : ("appaloft-managed" as const),
        providerKey: dependency.providerKey,
        connectionSecretRef: dependency.connectionSecretRef,
        bindings: dependency.bindings.map((binding) => ({
          resourceRef: binding.serviceRef,
          targetName: binding.targetName,
          scope: binding.scope,
          injectionMode: binding.injectionMode,
        })),
      })),
      volumes: source.services.flatMap((service) =>
        service.volumes.map((volume) => ({
          ...volume,
          resourceRef: service.ref,
        })),
      ),
      domains: source.services.flatMap((service) =>
        service.domains.map((domain) => ({ ...domain, resourceRef: service.ref })),
      ),
      sourceBlockers,
    },
  });
}
