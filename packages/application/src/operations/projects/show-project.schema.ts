import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const showProjectQueryInputSchema = z.object({
  projectId: nonEmptyTrimmedString("Project id"),
});

export type ShowProjectQueryInput = z.input<typeof showProjectQueryInputSchema>;
