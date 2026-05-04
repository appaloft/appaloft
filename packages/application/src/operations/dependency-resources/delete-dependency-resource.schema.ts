import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const deleteDependencyResourceCommandInputSchema = z.object({
  dependencyResourceId: nonEmptyTrimmedString("Dependency resource id"),
});

export type DeleteDependencyResourceCommandInput = z.output<
  typeof deleteDependencyResourceCommandInputSchema
>;
