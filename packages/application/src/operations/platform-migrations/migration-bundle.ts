import {
  domainError,
  err,
  ok,
  type Result,
  resourceExposureModes,
  resourceKinds,
  resourceNetworkProtocols,
  resourceServiceKinds,
  runtimePlanStrategies,
  sourceKinds,
} from "@appaloft/core";
import { z } from "zod";

import {
  environmentKindSchema,
  environmentVariableExposureSchema,
  environmentVariableKindSchema,
  nonEmptyTrimmedString,
  operationInputValidationDetails,
} from "../shared-schema";

const migrationRef = (label: string) =>
  nonEmptyTrimmedString(label).regex(
    /^[a-z][a-z0-9-]*$/,
    `${label} must use lowercase letters, numbers, and hyphens`,
  );

const migrationSourceSchema = z
  .object({
    kind: z.enum(sourceKinds),
    locator: nonEmptyTrimmedString("Source locator"),
    gitRef: nonEmptyTrimmedString("Git ref").optional(),
    commitSha: nonEmptyTrimmedString("Commit SHA").optional(),
    baseDirectory: nonEmptyTrimmedString("Base directory").optional(),
    imageDigest: nonEmptyTrimmedString("Image digest").optional(),
  })
  .strict();

const migrationRuntimeSchema = z
  .object({
    strategy: z.enum(runtimePlanStrategies).default("auto"),
    installCommand: nonEmptyTrimmedString("Install command").optional(),
    buildCommand: nonEmptyTrimmedString("Build command").optional(),
    startCommand: nonEmptyTrimmedString("Start command").optional(),
    publishDirectory: nonEmptyTrimmedString("Publish directory").optional(),
    dockerfilePath: nonEmptyTrimmedString("Dockerfile path").optional(),
    dockerComposeFilePath: nonEmptyTrimmedString("Docker Compose file path").optional(),
    healthCheckPath: nonEmptyTrimmedString("Health check path").optional(),
  })
  .strict();

const migrationNetworkSchema = z
  .object({
    internalPort: z.number().int().positive().max(65535),
    upstreamProtocol: z.enum(resourceNetworkProtocols).default("http"),
    exposureMode: z.enum(resourceExposureModes).default("reverse-proxy"),
    targetServiceName: nonEmptyTrimmedString("Target service name").optional(),
  })
  .strict();

const migrationVariableSchema = z
  .object({
    key: nonEmptyTrimmedString("Variable key"),
    value: z.string().optional(),
    secretRef: nonEmptyTrimmedString("Secret reference").optional(),
    exposure: environmentVariableExposureSchema,
    kind: environmentVariableKindSchema.default("plain-config"),
    resourceRef: migrationRef("Resource reference").optional(),
  })
  .strict()
  .superRefine((variable, context) => {
    if (
      variable.kind === "secret" &&
      (variable.secretRef === undefined || variable.value !== undefined)
    ) {
      context.addIssue({
        code: "custom",
        path: ["secretRef"],
        message: "Secret variables require secretRef and must not contain plaintext value",
      });
      return;
    }
    if ((variable.value === undefined) === (variable.secretRef === undefined)) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "Variable must provide exactly one of value or secretRef",
      });
    }
  });

const migrationResourceSchema = z
  .object({
    ref: migrationRef("Resource reference"),
    name: nonEmptyTrimmedString("Resource name"),
    kind: z.enum(resourceKinds).default("application"),
    services: z
      .array(
        z
          .object({
            name: nonEmptyTrimmedString("Resource service name"),
            kind: z.enum(resourceServiceKinds),
          })
          .strict(),
      )
      .default([]),
    description: nonEmptyTrimmedString("Resource description").optional(),
    source: migrationSourceSchema,
    runtime: migrationRuntimeSchema.default({ strategy: "auto" }),
    network: migrationNetworkSchema.optional(),
  })
  .strict();

const migrationDependencySchema = z
  .object({
    ref: migrationRef("Dependency reference"),
    name: nonEmptyTrimmedString("Dependency name"),
    kind: z.enum(["postgres", "mysql", "redis", "mongodb", "clickhouse", "generic"]),
    sourceMode: z.enum(["appaloft-managed", "imported-external"]).default("appaloft-managed"),
    providerKey: nonEmptyTrimmedString("Provider key"),
    connectionSecretRef: nonEmptyTrimmedString("Connection secret reference").optional(),
    bindings: z
      .array(
        z
          .object({
            resourceRef: migrationRef("Resource reference"),
            targetName: nonEmptyTrimmedString("Dependency binding target name"),
            scope: z.enum(["runtime-only", "build-and-runtime"]).default("runtime-only"),
            injectionMode: z.enum(["env", "file"]).default("env"),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();

const migrationVolumeSchema = z
  .object({
    ref: migrationRef("Volume reference"),
    name: nonEmptyTrimmedString("Volume name"),
    resourceRef: migrationRef("Resource reference"),
    mountPath: nonEmptyTrimmedString("Mount path"),
    sizeMb: z.number().int().positive().optional(),
  })
  .strict();

const migrationDomainSchema = z
  .object({
    hostname: nonEmptyTrimmedString("Hostname").toLowerCase(),
    resourceRef: migrationRef("Resource reference"),
    tlsPolicy: z.enum(["automatic", "manual", "disabled"]).default("automatic"),
  })
  .strict();

const migrationSourceBlockerSchema = z
  .object({
    code: nonEmptyTrimmedString("Source blocker code"),
    path: nonEmptyTrimmedString("Source blocker path"),
    message: nonEmptyTrimmedString("Source blocker message"),
  })
  .strict();

export const migrationBundleSchema = z
  .object({
    apiVersion: z.literal("appaloft.io/migration/v1"),
    kind: z.literal("MigrationBundle"),
    metadata: z
      .object({
        name: nonEmptyTrimmedString("Migration name"),
        source: z
          .object({
            provider: nonEmptyTrimmedString("Source provider").toLowerCase(),
            projectRef: nonEmptyTrimmedString("Source project reference").optional(),
          })
          .strict()
          .optional(),
      })
      .strict(),
    spec: z
      .object({
        project: z
          .object({
            name: nonEmptyTrimmedString("Project name"),
            description: z.string().optional(),
            organizationId: nonEmptyTrimmedString("Organization id").optional(),
          })
          .strict(),
        environment: z
          .object({
            name: nonEmptyTrimmedString("Environment name"),
            kind: environmentKindSchema,
          })
          .strict(),
        target: z
          .object({
            deploymentTargetId: nonEmptyTrimmedString("Deployment target id"),
            destinationId: nonEmptyTrimmedString("Destination id").optional(),
          })
          .strict(),
        resources: z.array(migrationResourceSchema).min(1),
        variables: z.array(migrationVariableSchema).default([]),
        dependencies: z.array(migrationDependencySchema).default([]),
        volumes: z.array(migrationVolumeSchema).default([]),
        domains: z.array(migrationDomainSchema).default([]),
        sourceBlockers: z.array(migrationSourceBlockerSchema).default([]),
      })
      .strict(),
  })
  .strict();

export type MigrationBundle = z.output<typeof migrationBundleSchema>;
export type MigrationBundleInput = z.input<typeof migrationBundleSchema>;

function canonicalizeMigrationBundle(bundle: MigrationBundle): MigrationBundle {
  return {
    ...bundle,
    spec: {
      ...bundle.spec,
      resources: [...bundle.spec.resources]
        .sort((left, right) => left.ref.localeCompare(right.ref))
        .map((resource) => ({
          ...resource,
          services: [...resource.services].sort((left, right) =>
            left.name.localeCompare(right.name),
          ),
        })),
      variables: [...bundle.spec.variables].sort((left, right) => {
        const resourceOrder = (left.resourceRef ?? "").localeCompare(right.resourceRef ?? "");
        return resourceOrder === 0 ? left.key.localeCompare(right.key) : resourceOrder;
      }),
      dependencies: [...bundle.spec.dependencies].sort((left, right) =>
        left.ref.localeCompare(right.ref),
      ),
      volumes: [...bundle.spec.volumes].sort((left, right) => left.ref.localeCompare(right.ref)),
      domains: [...bundle.spec.domains].sort((left, right) =>
        left.hostname.localeCompare(right.hostname),
      ),
      sourceBlockers: [...bundle.spec.sourceBlockers].sort((left, right) =>
        left.path.localeCompare(right.path),
      ),
    },
  };
}

export function parseMigrationBundle(input: unknown): Result<MigrationBundle> {
  const parsed = migrationBundleSchema.safeParse(input);
  if (!parsed.success) {
    return err(
      domainError.validation(
        "Migration bundle validation failed",
        operationInputValidationDetails(parsed.error.issues, "query-validation"),
      ),
    );
  }

  return ok(canonicalizeMigrationBundle(parsed.data));
}
