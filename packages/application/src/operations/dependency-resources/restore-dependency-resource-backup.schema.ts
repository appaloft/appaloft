import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const restoreDependencyResourceBackupCommandInputSchema = z.object({
  backupId: nonEmptyTrimmedString("Backup id"),
  acknowledgeDataOverwrite: z.literal(true),
  acknowledgeRuntimeNotRestarted: z.literal(true),
  targetDependencyResourceId: nonEmptyTrimmedString("Target dependency resource id").optional(),
  restoreLabel: nonEmptyTrimmedString("Restore label").optional(),
});

export type RestoreDependencyResourceBackupCommandInput = z.output<
  typeof restoreDependencyResourceBackupCommandInputSchema
>;
