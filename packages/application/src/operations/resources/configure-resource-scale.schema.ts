import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

const positiveInteger = z.number().int().positive();

export const resourceScaleProfileInputSchema = z
  .object({
    replicas: positiveInteger,
    cpuRequestMillicores: positiveInteger.optional(),
    cpuLimitMillicores: positiveInteger.optional(),
    memoryRequestMebibytes: positiveInteger.optional(),
    memoryLimitMebibytes: positiveInteger.optional(),
    horizontal: z
      .object({
        minReplicas: positiveInteger,
        maxReplicas: positiveInteger,
        targetCpuUtilizationPercent: positiveInteger.max(100),
      })
      .strict()
      .optional(),
  })
  .strict();

export const configureResourceScaleCommandInputSchema = z
  .object({
    resourceId: nonEmptyTrimmedString("Resource id"),
    scaleProfile: resourceScaleProfileInputSchema,
  })
  .strict();

export type ConfigureResourceScaleCommandInput = z.input<
  typeof configureResourceScaleCommandInputSchema
>;
export type ConfigureResourceScaleCommandPayload = z.output<
  typeof configureResourceScaleCommandInputSchema
>;
