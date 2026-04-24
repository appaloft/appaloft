import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type DeleteSshCredentialCommandInput,
  type DeleteSshCredentialCommandPayload,
  deleteSshCredentialCommandInputSchema,
} from "./delete-ssh-credential.schema";

export {
  type DeleteSshCredentialCommandInput,
  deleteSshCredentialCommandInputSchema,
} from "./delete-ssh-credential.schema";

export class DeleteSshCredentialCommand extends Command<{ id: string }> {
  constructor(
    public readonly credentialId: string,
    public readonly confirmation: DeleteSshCredentialCommandPayload["confirmation"],
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(input: DeleteSshCredentialCommandInput): Result<DeleteSshCredentialCommand> {
    return parseOperationInput(deleteSshCredentialCommandInputSchema, input).map(
      (parsed) =>
        new DeleteSshCredentialCommand(
          parsed.credentialId,
          parsed.confirmation,
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}
