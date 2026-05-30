import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const dependencyResourceBackupRelationshipInputSchema = z
  .object({
    retentionRequired: z.boolean().default(false),
    reason: nonEmptyTrimmedString("Backup relationship reason").optional(),
  })
  .optional();

export const dependencyResourceCapabilityRequirementInputSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("postgres-extension"),
    name: nonEmptyTrimmedString("Postgres extension name"),
    required: z.boolean().default(true),
    description: nonEmptyTrimmedString("Capability description").optional(),
  }),
  z.object({
    type: z.literal("redis-module"),
    name: nonEmptyTrimmedString("Redis module name"),
    required: z.boolean().default(true),
    description: nonEmptyTrimmedString("Capability description").optional(),
  }),
]);

export const dependencyResourceCapabilityRequirementsInputSchema = z
  .array(dependencyResourceCapabilityRequirementInputSchema)
  .optional();

export const dependencyResourceResponseSchema = z.object({
  id: z.string(),
});

export type DependencyResourceResponse = z.output<typeof dependencyResourceResponseSchema>;
