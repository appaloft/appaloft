import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";
import { deployTokenConfirmationSchema } from "./deploy-token.schema";

export const revokeDeployTokenCommandInputSchema = z.object({
  tokenId: nonEmptyTrimmedString("Deploy token id"),
  organizationId: nonEmptyTrimmedString("Organization id"),
  confirmation: deployTokenConfirmationSchema,
  reason: nonEmptyTrimmedString("Revocation reason").optional(),
  idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
});

export type RevokeDeployTokenCommandInput = z.input<typeof revokeDeployTokenCommandInputSchema>;
