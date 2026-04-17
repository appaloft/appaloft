import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type ConfirmDomainBindingOwnershipCommandInput,
  confirmDomainBindingOwnershipCommandInputSchema,
  type DomainBindingOwnershipVerificationMode,
} from "./confirm-domain-binding-ownership.schema";

export {
  type ConfirmDomainBindingOwnershipCommandInput,
  confirmDomainBindingOwnershipCommandInputSchema,
} from "./confirm-domain-binding-ownership.schema";

export class ConfirmDomainBindingOwnershipCommand extends Command<{
  id: string;
  verificationAttemptId: string;
}> {
  constructor(
    public readonly domainBindingId: string,
    public readonly verificationAttemptId?: string,
    public readonly verificationMode?: DomainBindingOwnershipVerificationMode,
    public readonly confirmedBy?: string,
    public readonly evidence?: string,
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(
    input: ConfirmDomainBindingOwnershipCommandInput,
  ): Result<ConfirmDomainBindingOwnershipCommand> {
    return parseOperationInput(confirmDomainBindingOwnershipCommandInputSchema, input).map(
      (parsed) =>
        new ConfirmDomainBindingOwnershipCommand(
          parsed.domainBindingId,
          parsed.verificationAttemptId,
          parsed.verificationMode,
          parsed.confirmedBy,
          parsed.evidence,
          parsed.idempotencyKey,
        ),
    );
  }
}
