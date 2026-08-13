import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

const positiveInteger = z.number().int().positive();

export const resourceRolloutProfileInputSchema = z
  .object({
    strategy: z.enum(["recreate", "rolling", "canary"]),
    maxUnavailable: positiveInteger.optional(),
    maxSurge: positiveInteger.optional(),
    canary: z
      .object({
        initialTrafficPercent: positiveInteger.max(99),
        stepTrafficPercent: positiveInteger.max(100),
        intervalSeconds: positiveInteger,
      })
      .strict()
      .optional(),
  })
  .strict();

export const configureResourceRolloutCommandInputSchema = z
  .object({
    resourceId: nonEmptyTrimmedString("Resource id"),
    rolloutProfile: resourceRolloutProfileInputSchema,
  })
  .strict();

export type ConfigureResourceRolloutCommandInput = z.input<
  typeof configureResourceRolloutCommandInputSchema
>;
export type ConfigureResourceRolloutCommandPayload = z.output<
  typeof configureResourceRolloutCommandInputSchema
>;
