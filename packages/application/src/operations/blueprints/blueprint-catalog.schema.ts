import {
  type BlueprintApplicationBundlePlan,
  type BlueprintInstallPlan,
  type BlueprintManifest,
  type BlueprintRegistryEntry,
} from "@appaloft/blueprints";
import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

const primitiveParameterValueSchema = z.union([z.string(), z.number(), z.boolean()]);

export const blueprintSlugSchema = nonEmptyTrimmedString("Blueprint slug");

export const blueprintInstallTargetSchema = z
  .object({
    projectName: nonEmptyTrimmedString("Project name").optional(),
    environmentName: nonEmptyTrimmedString("Environment name").optional(),
    resourceSlugPrefix: nonEmptyTrimmedString("Resource slug prefix").optional(),
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
    target: blueprintInstallTargetSchema.optional(),
  })
  .strict();

export const acceptBlueprintInstallCommandInputSchema = createBlueprintInstallPlanQueryInputSchema
  .extend({
    applicationId: nonEmptyTrimmedString("Installed application id").optional(),
    acceptedBy: nonEmptyTrimmedString("Accepted by").optional(),
    idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
    acknowledgements: z.array(nonEmptyTrimmedString("Acknowledgement")).optional(),
  })
  .strict();

export const blueprintRegistryEntryResponseSchema = z.custom<BlueprintRegistryEntry>();
export const blueprintManifestResponseSchema = z.custom<BlueprintManifest>();
export const blueprintInstallPlanResponseSchema = z.custom<BlueprintInstallPlan>();
export const blueprintApplicationBundlePlanResponseSchema =
  z.custom<BlueprintApplicationBundlePlan>();
export const acceptBlueprintInstallResponseSchema = z.custom<unknown>();

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
