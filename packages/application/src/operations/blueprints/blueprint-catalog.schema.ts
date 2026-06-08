import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export interface BlueprintRegistryDisplayIconResponse {
  readonly url?: string;
  readonly alt?: string;
  readonly initials?: string;
  readonly backgroundColor?: string;
  readonly foregroundColor?: string;
}

export interface BlueprintRegistryDisplayMetadataResponse {
  readonly category?: string;
  readonly categoryKey?: string;
  readonly icon?: BlueprintRegistryDisplayIconResponse | string;
  readonly websiteUrl?: string;
  readonly documentationUrl?: string;
}

export interface BlueprintRegistryEntryResponse extends BlueprintRegistryDisplayMetadataResponse {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly summary: string;
  readonly sourcePath?: string;
  readonly tags: readonly string[];
  readonly defaultVariant?: string;
  readonly variants: readonly {
    readonly id: string;
    readonly label?: string;
    readonly summary?: string;
  }[];
}

export type BlueprintPrimitiveParameterValueResponse = string | number | boolean;

export interface BlueprintParameterResponse {
  readonly key: string;
  readonly label: string;
  readonly type: "string" | "number" | "boolean";
  readonly required?: boolean;
  readonly default?: BlueprintPrimitiveParameterValueResponse;
  readonly description?: string | undefined;
}

export interface BlueprintSecretResponse {
  readonly key: string;
  readonly label: string;
  readonly required?: boolean;
  readonly source?: string;
  readonly description?: string | undefined;
}

export interface BlueprintResourceRequirementResponse {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly optional?: boolean;
  readonly capabilities?: readonly string[];
  readonly outputs?: readonly string[];
  readonly readiness?: readonly string[];
}

export interface BlueprintComponentResponse {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly runtime: {
    readonly strategy: string;
    readonly image?: string;
    readonly buildCommand?: string;
    readonly startCommand?: string;
    readonly outputDirectory?: string;
    readonly command?: readonly string[];
  };
  readonly ports: readonly {
    readonly name: string;
    readonly containerPort: number;
    readonly protocol: string;
    readonly public?: boolean;
  }[];
  readonly routes: readonly {
    readonly port: string;
    readonly pathPrefix: string;
  }[];
  readonly variables: readonly {
    readonly key: string;
    readonly value: string;
    readonly description?: string | undefined;
  }[];
  readonly usesSecrets: readonly string[];
  readonly usesResources: readonly string[];
  readonly storageMounts?: readonly {
    readonly volumeId: string;
    readonly mountPath: string;
  }[];
  readonly dependencyEnv?: readonly {
    readonly resourceId: string;
    readonly outputName: string;
    readonly envKey: string;
  }[];
}

export interface BlueprintProfileResponse {
  readonly label?: string;
  readonly replicas?: number;
  readonly variables?: readonly {
    readonly key: string;
    readonly value: string;
  }[];
  readonly routes?: readonly {
    readonly componentId?: string;
    readonly port?: string;
    readonly pathPrefix?: string;
  }[];
}

export interface BlueprintUpgradePolicyResponse {
  readonly strategy: string;
  readonly destructive?: boolean;
  readonly instructions?: string;
  readonly steps?: readonly {
    readonly classification: "non-breaking" | "potentially-breaking" | "breaking";
    readonly requiresManualReview?: boolean;
    readonly notes?: string;
    readonly changes?: readonly string[];
  }[];
}

export interface BlueprintVariantResponse {
  readonly label?: string;
  readonly summary?: string;
  readonly description?: string | undefined;
  readonly tags?: readonly string[];
  readonly defaultProfile?: string;
  readonly parameters?: readonly BlueprintParameterResponse[];
  readonly secrets?: readonly BlueprintSecretResponse[];
  readonly resources?: readonly BlueprintResourceRequirementResponse[];
  readonly components?: readonly BlueprintComponentResponse[];
  readonly profiles?: {
    readonly [profile: string]: BlueprintProfileResponse;
  };
  readonly upgrade?: BlueprintUpgradePolicyResponse;
}

export interface BlueprintManifestResponse {
  readonly schemaVersion: string;
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly summary: string;
  readonly description?: string | undefined;
  readonly tags: readonly string[];
  readonly parameters: readonly BlueprintParameterResponse[];
  readonly secrets: readonly BlueprintSecretResponse[];
  readonly resources: readonly BlueprintResourceRequirementResponse[];
  readonly components: readonly BlueprintComponentResponse[];
  readonly componentRelations: readonly unknown[];
  readonly profiles?: {
    readonly [profile: string]: BlueprintProfileResponse;
  };
  readonly defaultVariant?: string;
  readonly variants?: {
    readonly [variant: string]: BlueprintVariantResponse;
  };
  readonly upgrade?: BlueprintUpgradePolicyResponse;
}

export type BlueprintInstallPlanResponse = unknown;
export type BlueprintApplicationBundlePlanResponse = unknown;

const primitiveParameterValueSchema = z.union([z.string(), z.number(), z.boolean()]);

const unknownResponseSchema = <T>() => z.unknown() as z.ZodType<T>;

export const blueprintSlugSchema = nonEmptyTrimmedString("Blueprint slug");

export const blueprintInstallTargetSchema = z
  .object({
    projectId: nonEmptyTrimmedString("Project id").optional(),
    projectName: nonEmptyTrimmedString("Project name").optional(),
    environmentId: nonEmptyTrimmedString("Environment id").optional(),
    environmentName: nonEmptyTrimmedString("Environment name").optional(),
    resourceSlugPrefix: nonEmptyTrimmedString("Resource slug prefix").optional(),
    serverId: nonEmptyTrimmedString("Target server id").optional(),
  })
  .strict();

export const blueprintDependencyProvisioningSchema = z
  .object({
    requirementId: nonEmptyTrimmedString("Dependency requirement id"),
    kind: nonEmptyTrimmedString("Dependency kind").optional(),
    label: nonEmptyTrimmedString("Dependency label").optional(),
    mode: z.enum(["create", "reuse"]),
    providerKey: nonEmptyTrimmedString("Dependency provider key").optional(),
    target: z
      .object({
        serverId: nonEmptyTrimmedString("Target server id").optional(),
      })
      .strict()
      .optional(),
    reuse: z
      .object({
        maskedConnection: nonEmptyTrimmedString("Masked connection").optional(),
        actualVersion: nonEmptyTrimmedString("Actual version").optional(),
        secretRef: nonEmptyTrimmedString("Reuse secret ref").optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const blueprintInstallSecretValueSchema = z
  .object({
    componentId: nonEmptyTrimmedString("Component id").optional(),
    key: nonEmptyTrimmedString("Secret key"),
    value: z.string().min(1, "Secret value is required"),
  })
  .strict();

export const listBlueprintsQueryInputSchema = z.object({});

export const showBlueprintQueryInputSchema = z.object({
  slug: blueprintSlugSchema,
});

export const showBlueprintInstallationQueryInputSchema = z
  .object({
    applicationId: nonEmptyTrimmedString("Installed application id"),
  })
  .strict();

export const createBlueprintInstallPlanQueryInputSchema = z
  .object({
    slug: blueprintSlugSchema,
    variant: nonEmptyTrimmedString("Blueprint variant").optional(),
    profile: nonEmptyTrimmedString("Blueprint profile").optional(),
    parameters: z.record(z.string(), primitiveParameterValueSchema).optional(),
    dependencyProvisioning: z.array(blueprintDependencyProvisioningSchema).optional(),
    target: blueprintInstallTargetSchema.optional(),
  })
  .strict();

export const acceptBlueprintInstallCommandInputSchema = createBlueprintInstallPlanQueryInputSchema
  .extend({
    applicationId: nonEmptyTrimmedString("Installed application id").optional(),
    acceptedBy: nonEmptyTrimmedString("Accepted by").optional(),
    idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
    acknowledgements: z.array(nonEmptyTrimmedString("Acknowledgement")).optional(),
    secretValues: z.array(blueprintInstallSecretValueSchema).optional(),
  })
  .strict();

export const blueprintRegistryEntryResponseSchema =
  unknownResponseSchema<BlueprintRegistryEntryResponse>();
export const blueprintManifestResponseSchema = unknownResponseSchema<BlueprintManifestResponse>();
export const blueprintInstallPlanResponseSchema =
  unknownResponseSchema<BlueprintInstallPlanResponse>();
export const blueprintApplicationBundlePlanResponseSchema =
  unknownResponseSchema<BlueprintApplicationBundlePlanResponse>();
export const acceptBlueprintInstallResponseSchema = z.unknown();
export const showBlueprintInstallationResponseSchema = z.unknown();

export const listBlueprintsResponseSchema = z.object({
  items: z.array(blueprintRegistryEntryResponseSchema),
});

export const showBlueprintResponseSchema = z.object({
  entry: blueprintRegistryEntryResponseSchema,
  manifest: blueprintManifestResponseSchema,
});

export const createBlueprintInstallPlanResponseSchema = z.object({
  entry: blueprintRegistryEntryResponseSchema,
  plan: blueprintInstallPlanResponseSchema,
  applicationBundle: blueprintApplicationBundlePlanResponseSchema,
});

export type ListBlueprintsQueryInput = z.input<typeof listBlueprintsQueryInputSchema>;
export type ListBlueprintsResponse = z.output<typeof listBlueprintsResponseSchema>;
export type ShowBlueprintQueryInput = z.input<typeof showBlueprintQueryInputSchema>;
export type ShowBlueprintResponse = z.output<typeof showBlueprintResponseSchema>;
export type ShowBlueprintInstallationQueryInput = z.input<
  typeof showBlueprintInstallationQueryInputSchema
>;
export type ShowBlueprintInstallationResponse = z.output<
  typeof showBlueprintInstallationResponseSchema
>;
export type CreateBlueprintInstallPlanQueryInput = z.input<
  typeof createBlueprintInstallPlanQueryInputSchema
>;
export type CreateBlueprintInstallPlanResponse = z.output<
  typeof createBlueprintInstallPlanResponseSchema
>;
export type AcceptBlueprintInstallCommandInput = z.input<
  typeof acceptBlueprintInstallCommandInputSchema
>;
export type AcceptBlueprintInstallCommandResponse = z.output<
  typeof acceptBlueprintInstallResponseSchema
>;
