import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const showDependencyResourceBackupQueryInputSchema = z.object({
  backupId: nonEmptyTrimmedString("Backup id"),
});

export type ShowDependencyResourceBackupQueryInput = z.output<
  typeof showDependencyResourceBackupQueryInputSchema
>;
