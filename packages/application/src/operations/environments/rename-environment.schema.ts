import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const renameEnvironmentCommandInputSchema = z.object({
  environmentId: nonEmptyTrimmedString("Environment id"),
  name: nonEmptyTrimmedString("Environment name"),
});

export type RenameEnvironmentCommandInput = z.input<typeof renameEnvironmentCommandInputSchema>;
export type RenameEnvironmentCommandPayload = z.output<typeof renameEnvironmentCommandInputSchema>;
