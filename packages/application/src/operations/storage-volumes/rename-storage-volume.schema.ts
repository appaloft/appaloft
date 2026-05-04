import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const renameStorageVolumeCommandInputSchema = z.object({
  storageVolumeId: nonEmptyTrimmedString("Storage volume id"),
  name: nonEmptyTrimmedString("Storage volume name"),
});

export type RenameStorageVolumeCommandInput = z.output<
  typeof renameStorageVolumeCommandInputSchema
>;
