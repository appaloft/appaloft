import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type DeleteServerCommandInput,
  type DeleteServerCommandPayload,
  deleteServerCommandInputSchema,
} from "./delete-server.schema";

export {
  type DeleteServerCommandInput,
  deleteServerCommandInputSchema,
} from "./delete-server.schema";

export class DeleteServerCommand extends Command<{ id: string }> {
  constructor(
    public readonly serverId: string,
    public readonly confirmation: DeleteServerCommandPayload["confirmation"],
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(input: DeleteServerCommandInput): Result<DeleteServerCommand> {
    return parseOperationInput(deleteServerCommandInputSchema, input).map(
      (parsed) =>
        new DeleteServerCommand(
          parsed.serverId,
          parsed.confirmation,
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}
