import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

const baseResourceRuntimeControlCommandInputSchema = z.object({
  resourceId: nonEmptyTrimmedString("Resource id").optional(),
  previewEnvironmentId: nonEmptyTrimmedString("Preview environment id").optional(),
  deploymentId: nonEmptyTrimmedString("Deployment id").optional(),
  reason: nonEmptyTrimmedString("Reason").optional(),
  idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
});

const requireResourceOrPreview = <Schema extends z.ZodObject<z.ZodRawShape>>(schema: Schema) =>
  schema.superRefine(
    (
      input: { resourceId?: string | undefined; previewEnvironmentId?: string | undefined },
      context,
    ) => {
      if (input.resourceId || input.previewEnvironmentId) {
        return;
      }

      context.addIssue({
        code: "custom",
        message: "Either resourceId or previewEnvironmentId is required",
        path: ["resourceId"],
      });
    },
  );

const retainedRuntimeMetadataAcknowledgementSchema = {
  acknowledgeRetainedRuntimeMetadata: z.boolean().optional(),
};

export const stopResourceRuntimeCommandInputSchema = requireResourceOrPreview(
  baseResourceRuntimeControlCommandInputSchema,
);

export const startResourceRuntimeCommandInputSchema = requireResourceOrPreview(
  baseResourceRuntimeControlCommandInputSchema.extend(retainedRuntimeMetadataAcknowledgementSchema),
);

export const restartResourceRuntimeCommandInputSchema = requireResourceOrPreview(
  baseResourceRuntimeControlCommandInputSchema.extend(retainedRuntimeMetadataAcknowledgementSchema),
);

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
