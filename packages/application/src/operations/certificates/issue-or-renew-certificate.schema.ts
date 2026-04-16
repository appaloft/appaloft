import { certificateIssueReasons } from "@yundu/core";
import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const issueOrRenewCertificateCommandInputSchema = z.object({
  domainBindingId: nonEmptyTrimmedString("Domain binding id"),
  certificateId: nonEmptyTrimmedString("Certificate id").optional(),
  reason: z.enum(certificateIssueReasons).default("issue"),
  providerKey: nonEmptyTrimmedString("Provider key").optional(),
  challengeType: nonEmptyTrimmedString("Challenge type").optional(),
  idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
  causationId: nonEmptyTrimmedString("Causation id").optional(),
});

export type IssueOrRenewCertificateCommandInput = z.input<
  typeof issueOrRenewCertificateCommandInputSchema
>;
