import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const sourceEventSourceKindSchema = z.enum(["github", "gitlab", "generic-signed"]);
export const sourceEventKindSchema = z.enum(["push", "tag"]);
export const sourceEventStatusSchema = z.enum([
  "accepted",
  "deduped",
  "ignored",
  "blocked",
  "dispatched",
  "failed",
]);

export const sourceEventIdentitySchema = z.object({
  locator: nonEmptyTrimmedString("Source locator"),
  providerRepositoryId: nonEmptyTrimmedString("Provider repository id").optional(),
  repositoryFullName: nonEmptyTrimmedString("Repository full name").optional(),
});

export const verifiedSourceEventVerificationSchema = z.object({
  status: z.literal("verified"),
  method: z.enum(["provider-signature", "generic-hmac"]),
  keyVersion: nonEmptyTrimmedString("Verification key version").optional(),
});
