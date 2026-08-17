import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const sourceEventSourceKindSchema = z.enum(["github", "gitlab", "generic-signed"]);
export const sourceEventKindSchema = z.enum([
  "push",
  "tag",
  "issue_comment.created",
  "pull_request_review_comment.created",
  "issues.labeled",
  "pull_request.labeled",
  "pull_request.ready_for_review",
  "pull_request.synchronize",
  "pull_request.closed",
]);
export const sourceEventStatusSchema = z.enum([
  "accepted",
  "deduped",
  "ignored",
  "blocked",
  "waiting-checks",
  "checks-blocked",
  "superseded",
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
