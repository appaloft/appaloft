import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const createDependencyResourceBackupCommandInputSchema = z.object({
  dependencyResourceId: nonEmptyTrimmedString("Dependency resource id"),
  description: nonEmptyTrimmedString("Description").optional(),
  providerKey: nonEmptyTrimmedString("Provider key").optional(),
});

export type CreateDependencyResourceBackupCommandInput = z.output<
  typeof createDependencyResourceBackupCommandInputSchema
>;
