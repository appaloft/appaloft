import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const deleteStorageVolumeCommandInputSchema = z.object({
  storageVolumeId: nonEmptyTrimmedString("Storage volume id"),
});

export type DeleteStorageVolumeCommandInput = z.output<
  typeof deleteStorageVolumeCommandInputSchema
>;
