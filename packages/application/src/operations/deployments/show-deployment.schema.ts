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

export const showDeploymentQueryInputSchema = z.object({
  deploymentId: nonEmptyTrimmedString("Deployment id"),
  includeTimeline: booleanInput(true),
  includeSnapshot: booleanInput(true),
  includeRelatedContext: booleanInput(true),
  includeLatestFailure: booleanInput(true),
});

export type ShowDeploymentQueryInput = z.input<typeof showDeploymentQueryInputSchema>;
export type ShowDeploymentQueryParsedInput = z.output<typeof showDeploymentQueryInputSchema>;
