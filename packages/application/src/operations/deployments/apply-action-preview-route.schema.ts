import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const actionPreviewRouteTlsModeSchema = z.enum(["auto", "disabled"]);

export const applyActionPreviewRouteCommandInputSchema = z
  .object({
    sourceFingerprint: nonEmptyTrimmedString("Source fingerprint"),
    projectId: nonEmptyTrimmedString("Project id"),
    environmentId: nonEmptyTrimmedString("Environment id"),
    resourceId: nonEmptyTrimmedString("Resource id"),
    serverId: nonEmptyTrimmedString("Server id").optional(),
    destinationId: nonEmptyTrimmedString("Destination id").optional(),
    host: nonEmptyTrimmedString("Preview route host"),
    pathPrefix: nonEmptyTrimmedString("Preview route path prefix").default("/"),
    tlsMode: actionPreviewRouteTlsModeSchema.default("disabled"),
  })
  .strict();

export type ApplyActionPreviewRouteCommandInput = z.input<
  typeof applyActionPreviewRouteCommandInputSchema
>;

export type ApplyActionPreviewRouteCommandParsedInput = z.output<
  typeof applyActionPreviewRouteCommandInputSchema
>;

export const applyActionPreviewRouteResponseSchema = z.object({
  previewUrl: z.string(),
});

export type ApplyActionPreviewRouteResponse = z.output<
  typeof applyActionPreviewRouteResponseSchema
>;
