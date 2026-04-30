import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type DeleteDomainBindingCommandInput,
  type DeleteDomainBindingCommandPayload,
  deleteDomainBindingCommandInputSchema,
} from "./delete-domain-binding.schema";

export {
  type DeleteDomainBindingCommandInput,
  deleteDomainBindingCommandInputSchema,
} from "./delete-domain-binding.schema";

export class DeleteDomainBindingCommand extends Command<{ id: string }> {
  constructor(
    public readonly domainBindingId: string,
    public readonly confirmation: DeleteDomainBindingCommandPayload["confirmation"],
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(input: DeleteDomainBindingCommandInput): Result<DeleteDomainBindingCommand> {
    return parseOperationInput(deleteDomainBindingCommandInputSchema, input).map(
      (parsed) =>
        new DeleteDomainBindingCommand(
          parsed.domainBindingId,
          parsed.confirmation,
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}
