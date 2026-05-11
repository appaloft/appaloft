import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";
import { deployTokenConfirmationSchema } from "./deploy-token.schema";

export const rotateDeployTokenCommandInputSchema = z.object({
  tokenId: nonEmptyTrimmedString("Deploy token id"),
  organizationId: nonEmptyTrimmedString("Organization id"),
  confirmation: deployTokenConfirmationSchema,
  idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
});

export type RotateDeployTokenCommandInput = z.input<typeof rotateDeployTokenCommandInputSchema>;
