import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";
import { deployTokenScopeInputSchema } from "./deploy-token.schema";

export const createDeployTokenCommandInputSchema = z.object({
  organizationId: nonEmptyTrimmedString("Organization id"),
  displayName: nonEmptyTrimmedString("Deploy token display name"),
  scope: deployTokenScopeInputSchema,
  expiresAt: nonEmptyTrimmedString("Expiration timestamp").optional(),
  idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
});

export type CreateDeployTokenCommandInput = z.input<typeof createDeployTokenCommandInputSchema>;
