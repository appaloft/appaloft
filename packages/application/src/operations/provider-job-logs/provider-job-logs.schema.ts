import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const pruneProviderJobLogsCommandInputSchema = z.object({
  before: z.string().datetime(),
  deploymentId: nonEmptyTrimmedString("Deployment id").optional(),
  providerKey: nonEmptyTrimmedString("Provider key").optional(),
  resourceId: nonEmptyTrimmedString("Resource id").optional(),
  serverId: nonEmptyTrimmedString("Server id").optional(),
  dryRun: z.boolean().default(true),
});

export type PruneProviderJobLogsCommandInput = z.input<
  typeof pruneProviderJobLogsCommandInputSchema
>;
