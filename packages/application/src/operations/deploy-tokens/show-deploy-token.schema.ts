import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const showDeployTokenQueryInputSchema = z.object({
  organizationId: nonEmptyTrimmedString("Organization id"),
  tokenId: nonEmptyTrimmedString("Deploy token id"),
});

export type ShowDeployTokenQueryInput = z.input<typeof showDeployTokenQueryInputSchema>;
