import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const listStorageVolumesQueryInputSchema = z.object({
  projectId: nonEmptyTrimmedString("Project id").optional(),
  environmentId: nonEmptyTrimmedString("Environment id").optional(),
});

export type ListStorageVolumesQueryInput = z.output<typeof listStorageVolumesQueryInputSchema>;
