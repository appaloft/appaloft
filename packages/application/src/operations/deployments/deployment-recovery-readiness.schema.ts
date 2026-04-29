import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

const booleanInput = (defaultValue: boolean) =>
  z
    .union([
      z.boolean(),
      z.literal("true").transform(() => true),
      z.literal("false").transform(() => false),
    ])
    .default(defaultValue);

const optionalPositiveIntegerInput = z
  .union([
    z.number().int().positive(),
    z.string().trim().transform(Number).pipe(z.number().int().positive()),
  ])
  .optional();

export const deploymentRecoveryReadinessQueryInputSchema = z.object({
  deploymentId: nonEmptyTrimmedString("Deployment id"),
  resourceId: nonEmptyTrimmedString("Resource id").optional(),
  includeCandidates: booleanInput(true),
  maxCandidates: optionalPositiveIntegerInput,
});

export type DeploymentRecoveryReadinessQueryInput = z.input<
  typeof deploymentRecoveryReadinessQueryInputSchema
>;
export type DeploymentRecoveryReadinessQueryParsedInput = z.output<
  typeof deploymentRecoveryReadinessQueryInputSchema
>;
