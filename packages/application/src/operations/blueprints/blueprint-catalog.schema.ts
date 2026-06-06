import {
  type BlueprintApplicationBundlePlan,
  type BlueprintInstallPlan,
  type BlueprintManifest,
  type BlueprintRegistryEntry,
} from "@appaloft/blueprints";
import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

const primitiveParameterValueSchema = z.union([z.string(), z.number(), z.boolean()]);

const unknownResponseSchema = <T>() => z.unknown() as z.ZodType<T>;

export const blueprintSlugSchema = nonEmptyTrimmedString("Blueprint slug");

export const blueprintInstallTargetSchema = z
  .object({
    projectName: nonEmptyTrimmedString("Project name").optional(),
    environmentName: nonEmptyTrimmedString("Environment name").optional(),
    resourceSlugPrefix: nonEmptyTrimmedString("Resource slug prefix").optional(),
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
    componentId: nonEmptyTrimmedString("Component id"),
    key: nonEmptyTrimmedString("Secret key"),
    value: z.string().min(1, "Secret value is required"),
  })
  .strict();

export const listBlueprintsQueryInputSchema = z.object({});

export const showBlueprintQueryInputSchema = z.object({
  slug: blueprintSlugSchema,
});

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

export const blueprintRegistryEntryResponseSchema = unknownResponseSchema<BlueprintRegistryEntry>();
export const blueprintManifestResponseSchema = unknownResponseSchema<BlueprintManifest>();
export const blueprintInstallPlanResponseSchema = unknownResponseSchema<BlueprintInstallPlan>();
export const blueprintApplicationBundlePlanResponseSchema =
  unknownResponseSchema<BlueprintApplicationBundlePlan>();
export const acceptBlueprintInstallResponseSchema = z.unknown();

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
