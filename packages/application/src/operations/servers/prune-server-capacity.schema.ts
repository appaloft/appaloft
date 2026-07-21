import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const runtimeTargetPruneCategorySchema = z.enum([
  "stopped-containers",
  "preview-workspaces",
  "source-workspaces",
  "docker-build-cache",
  "unused-images",
  "remote-state-markers",
]);

export const defaultRuntimeTargetPruneCategories = [
  "stopped-containers",
  "preview-workspaces",
  "source-workspaces",
] as const satisfies RuntimeTargetPruneCategory[];
export const runtimeTargetPruneCategories = runtimeTargetPruneCategorySchema.options;

export const pruneServerCapacityCommandInputSchema = z
  .object({
    serverId: nonEmptyTrimmedString("Server id"),
    before: z.string().datetime(),
    categories: z
      .array(runtimeTargetPruneCategorySchema)
      .min(1)
      .default([...defaultRuntimeTargetPruneCategories]),
    target: nonEmptyTrimmedString("Runtime prune candidate target").optional(),
    dryRun: z.boolean().default(true),
    includeOrphanRunning: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.includeOrphanRunning && !value.target) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["target"],
        message: "includeOrphanRunning requires an explicit target filter",
      });
    }
  });

export type RuntimeTargetPruneCategory = z.output<typeof runtimeTargetPruneCategorySchema>;
export type PruneServerCapacityCommandInput = z.input<typeof pruneServerCapacityCommandInputSchema>;
export type ParsedPruneServerCapacityCommandInput = z.output<
  typeof pruneServerCapacityCommandInputSchema
>;
