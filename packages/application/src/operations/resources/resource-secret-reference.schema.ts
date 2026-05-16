import { z } from "zod";

import { environmentVariableExposureSchema, nonEmptyTrimmedString } from "../shared-schema";

const secretReferenceExposureSchema = environmentVariableExposureSchema.default("runtime");

export const createResourceSecretReferenceCommandInputSchema = z.object({
  resourceId: nonEmptyTrimmedString("resourceId"),
  key: nonEmptyTrimmedString("key"),
  value: z.string().min(1),
  exposure: secretReferenceExposureSchema,
});

export const rotateResourceSecretReferenceCommandInputSchema = z.object({
  resourceId: nonEmptyTrimmedString("resourceId"),
  key: nonEmptyTrimmedString("key"),
  value: z.string().min(1),
  exposure: secretReferenceExposureSchema,
});

export const deleteResourceSecretReferenceCommandInputSchema = z.object({
  resourceId: nonEmptyTrimmedString("resourceId"),
  key: nonEmptyTrimmedString("key"),
  exposure: secretReferenceExposureSchema,
});

export const listResourceSecretReferencesQueryInputSchema = z.object({
  resourceId: nonEmptyTrimmedString("resourceId"),
  exposure: secretReferenceExposureSchema.optional(),
});

export const showResourceSecretReferenceQueryInputSchema = z.object({
  resourceId: nonEmptyTrimmedString("resourceId"),
  key: nonEmptyTrimmedString("key"),
  exposure: secretReferenceExposureSchema,
});

export type CreateResourceSecretReferenceCommandInput = z.output<
  typeof createResourceSecretReferenceCommandInputSchema
>;
export type RotateResourceSecretReferenceCommandInput = z.output<
  typeof rotateResourceSecretReferenceCommandInputSchema
>;
export type DeleteResourceSecretReferenceCommandInput = z.output<
  typeof deleteResourceSecretReferenceCommandInputSchema
>;
export type ListResourceSecretReferencesQueryInput = z.output<
  typeof listResourceSecretReferencesQueryInputSchema
>;
export type ShowResourceSecretReferenceQueryInput = z.output<
  typeof showResourceSecretReferenceQueryInputSchema
>;
