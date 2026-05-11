import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const bootstrapFirstAdminCommandInputSchema = z.object({
  email: z.string().trim().email("First admin email must be valid"),
  displayName: nonEmptyTrimmedString("First admin display name"),
  password: nonEmptyTrimmedString("First admin password").optional(),
  organizationName: nonEmptyTrimmedString("Organization name").optional(),
  organizationSlug: nonEmptyTrimmedString("Organization slug").optional(),
  idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
});

export type BootstrapFirstAdminCommandInput = z.input<typeof bootstrapFirstAdminCommandInputSchema>;
