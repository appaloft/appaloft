import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

const baseResourceRuntimeControlCommandInputSchema = z.object({
  resourceId: nonEmptyTrimmedString("Resource id"),
  deploymentId: nonEmptyTrimmedString("Deployment id").optional(),
  reason: nonEmptyTrimmedString("Reason").optional(),
  idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
});

const retainedRuntimeMetadataAcknowledgementSchema = {
  acknowledgeRetainedRuntimeMetadata: z.boolean().optional(),
};

export const stopResourceRuntimeCommandInputSchema = baseResourceRuntimeControlCommandInputSchema;

export const startResourceRuntimeCommandInputSchema =
  baseResourceRuntimeControlCommandInputSchema.extend(retainedRuntimeMetadataAcknowledgementSchema);

export const restartResourceRuntimeCommandInputSchema =
  baseResourceRuntimeControlCommandInputSchema.extend(retainedRuntimeMetadataAcknowledgementSchema);

export type StopResourceRuntimeCommandInput = z.input<typeof stopResourceRuntimeCommandInputSchema>;
export type StopResourceRuntimeCommandPayload = z.output<
  typeof stopResourceRuntimeCommandInputSchema
>;

export type StartResourceRuntimeCommandInput = z.input<
  typeof startResourceRuntimeCommandInputSchema
>;
export type StartResourceRuntimeCommandPayload = z.output<
  typeof startResourceRuntimeCommandInputSchema
>;

export type RestartResourceRuntimeCommandInput = z.input<
  typeof restartResourceRuntimeCommandInputSchema
>;
export type RestartResourceRuntimeCommandPayload = z.output<
  typeof restartResourceRuntimeCommandInputSchema
>;
