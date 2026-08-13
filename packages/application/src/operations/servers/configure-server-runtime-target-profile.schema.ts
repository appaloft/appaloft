import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const runtimeTargetProfileReferenceSchema = z
  .string()
  .trim()
  .min(1, "Runtime target profile reference is required")
  .max(512, "Runtime target profile reference must not exceed 512 characters")
  .regex(
    /^[a-z][a-z0-9+.-]*:\/\/\S+$/i,
    "Runtime target profile reference must be an opaque URI-like reference",
  );

export const runtimeTargetProfileSnapshotSchema = z
  .object({
    schemaVersion: z.literal("runtime-target-profile/v1"),
    connectionReference: runtimeTargetProfileReferenceSchema,
    credentialReference: runtimeTargetProfileReferenceSchema.optional(),
    placementPolicyReference: runtimeTargetProfileReferenceSchema.optional(),
    routingPolicyReference: runtimeTargetProfileReferenceSchema.optional(),
    registryCredentialReference: runtimeTargetProfileReferenceSchema.optional(),
    capabilityPolicyReference: runtimeTargetProfileReferenceSchema.optional(),
  })
  .strict();

export const configureServerRuntimeTargetProfileCommandInputSchema = z
  .object({
    serverId: nonEmptyTrimmedString("Server id"),
    connectionReference: runtimeTargetProfileReferenceSchema,
    credentialReference: runtimeTargetProfileReferenceSchema.optional(),
    placementPolicyReference: runtimeTargetProfileReferenceSchema.optional(),
    routingPolicyReference: runtimeTargetProfileReferenceSchema.optional(),
    registryCredentialReference: runtimeTargetProfileReferenceSchema.optional(),
    capabilityPolicyReference: runtimeTargetProfileReferenceSchema.optional(),
  })
  .strict();

export const configureServerRuntimeTargetProfileResultSchema = z.object({
  profile: runtimeTargetProfileSnapshotSchema,
  changed: z.boolean(),
});

export type ConfigureServerRuntimeTargetProfileCommandInput = z.input<
  typeof configureServerRuntimeTargetProfileCommandInputSchema
>;
export type ConfigureServerRuntimeTargetProfileCommandPayload = z.output<
  typeof configureServerRuntimeTargetProfileCommandInputSchema
>;
export type ConfigureServerRuntimeTargetProfileResult = z.output<
  typeof configureServerRuntimeTargetProfileResultSchema
>;
