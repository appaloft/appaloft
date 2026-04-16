import { type Result } from "@yundu/core";

import { Command } from "../../cqrs";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type IssueOrRenewCertificateCommandInput,
  issueOrRenewCertificateCommandInputSchema,
} from "./issue-or-renew-certificate.schema";

export {
  type IssueOrRenewCertificateCommandInput,
  issueOrRenewCertificateCommandInputSchema,
} from "./issue-or-renew-certificate.schema";

export interface IssueOrRenewCertificateCommandResult {
  certificateId: string;
  attemptId: string;
}

export class IssueOrRenewCertificateCommand extends Command<IssueOrRenewCertificateCommandResult> {
  constructor(
    public readonly domainBindingId: string,
    public readonly reason: NonNullable<IssueOrRenewCertificateCommandInput["reason"]>,
    public readonly certificateId?: string,
    public readonly providerKey?: string,
    public readonly challengeType?: string,
    public readonly idempotencyKey?: string,
    public readonly causationId?: string,
  ) {
    super();
  }

  static create(
    input: IssueOrRenewCertificateCommandInput,
  ): Result<IssueOrRenewCertificateCommand> {
    return parseOperationInput(issueOrRenewCertificateCommandInputSchema, input).map(
      (parsed) =>
        new IssueOrRenewCertificateCommand(
          parsed.domainBindingId,
          parsed.reason,
          trimToUndefined(parsed.certificateId),
          trimToUndefined(parsed.providerKey),
          trimToUndefined(parsed.challengeType),
          trimToUndefined(parsed.idempotencyKey),
          trimToUndefined(parsed.causationId),
        ),
    );
  }
}
