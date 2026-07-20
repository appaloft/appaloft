import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const rotateDependencyResourceConnectionCommandInputSchema = z.object({
  dependencyResourceId: nonEmptyTrimmedString("Dependency resource id"),
  connectionUrl: nonEmptyTrimmedString("Connection URL"),
});

export type RotateDependencyResourceConnectionCommandInput = z.output<
  typeof rotateDependencyResourceConnectionCommandInputSchema
>;
