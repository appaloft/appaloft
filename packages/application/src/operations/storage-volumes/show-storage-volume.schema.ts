import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const showStorageVolumeQueryInputSchema = z.object({
  storageVolumeId: nonEmptyTrimmedString("Storage volume id"),
});

export type ShowStorageVolumeQueryInput = z.output<typeof showStorageVolumeQueryInputSchema>;
