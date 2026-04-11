import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const diffEnvironmentsQueryInputSchema = z.object({
  environmentId: nonEmptyTrimmedString("Environment id"),
  otherEnvironmentId: nonEmptyTrimmedString("Other environment id"),
});

export type DiffEnvironmentsQueryInput = z.input<typeof diffEnvironmentsQueryInputSchema>;
