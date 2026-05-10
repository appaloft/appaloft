import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";
import { actionPreviewRouteTlsModeSchema } from "./apply-action-preview-route.schema";

export const confirmActionPreviewRouteCommandInputSchema = z
  .object({
    deploymentId: nonEmptyTrimmedString("Deployment id"),
    host: nonEmptyTrimmedString("Preview route host"),
    pathPrefix: nonEmptyTrimmedString("Preview route path prefix").default("/"),
    tlsMode: actionPreviewRouteTlsModeSchema.default("disabled"),
  })
  .strict();

export type ConfirmActionPreviewRouteCommandInput = z.input<
  typeof confirmActionPreviewRouteCommandInputSchema
>;

export type ConfirmActionPreviewRouteCommandParsedInput = z.output<
  typeof confirmActionPreviewRouteCommandInputSchema
>;

export const confirmActionPreviewRouteResponseSchema = z.object({
  previewUrl: z.string(),
});

export type ConfirmActionPreviewRouteResponse = z.output<
  typeof confirmActionPreviewRouteResponseSchema
>;
