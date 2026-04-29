import { z } from "zod";

import { operatorWorkKinds, operatorWorkStatuses } from "../../ports";

const queryLimitSchema = z
  .union([
    z.number().int().positive().max(200),
    z
      .string()
      .trim()
      .regex(/^\d+$/)
      .transform((value) => Number(value))
      .pipe(z.number().int().positive().max(200)),
  ])
  .optional();

export const listOperatorWorkQueryInputSchema = z.object({
  kind: z.enum(operatorWorkKinds).optional(),
  status: z.enum(operatorWorkStatuses).optional(),
  resourceId: z.string().optional(),
  serverId: z.string().optional(),
  deploymentId: z.string().optional(),
  limit: queryLimitSchema,
});

export type ListOperatorWorkQueryInput = z.input<typeof listOperatorWorkQueryInputSchema>;
