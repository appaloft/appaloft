import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type RetryDomainBindingVerificationCommandInput,
  retryDomainBindingVerificationCommandInputSchema,
} from "./retry-domain-binding-verification.schema";

export interface RetryDomainBindingVerificationCommandResult {
  id: string;
  verificationAttemptId: string;
}

export {
  type RetryDomainBindingVerificationCommandInput,
  retryDomainBindingVerificationCommandInputSchema,
} from "./retry-domain-binding-verification.schema";

export class RetryDomainBindingVerificationCommand extends Command<RetryDomainBindingVerificationCommandResult> {
  constructor(
    public readonly domainBindingId: string,
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(
    input: RetryDomainBindingVerificationCommandInput,
  ): Result<RetryDomainBindingVerificationCommand> {
    return parseOperationInput(retryDomainBindingVerificationCommandInputSchema, input).map(
      (parsed) =>
        new RetryDomainBindingVerificationCommand(
          parsed.domainBindingId,
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}
