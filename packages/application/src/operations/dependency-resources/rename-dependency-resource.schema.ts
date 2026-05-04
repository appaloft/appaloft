import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const renameDependencyResourceCommandInputSchema = z.object({
  dependencyResourceId: nonEmptyTrimmedString("Dependency resource id"),
  name: nonEmptyTrimmedString("Dependency resource name"),
});

export type RenameDependencyResourceCommandInput = z.output<
  typeof renameDependencyResourceCommandInputSchema
>;
