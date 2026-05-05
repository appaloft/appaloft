import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const unbindResourceDependencyCommandInputSchema = z.object({
  resourceId: nonEmptyTrimmedString("Resource id"),
  bindingId: nonEmptyTrimmedString("Resource dependency binding id"),
});

export type UnbindResourceDependencyCommandInput = z.output<
  typeof unbindResourceDependencyCommandInputSchema
>;
