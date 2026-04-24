import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type RenameServerCommandInput,
  renameServerCommandInputSchema,
} from "./rename-server.schema";

export {
  type RenameServerCommandInput,
  renameServerCommandInputSchema,
} from "./rename-server.schema";

export class RenameServerCommand extends Command<{ id: string }> {
  constructor(
    public readonly serverId: string,
    public readonly name: string,
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(input: RenameServerCommandInput): Result<RenameServerCommand> {
    return parseOperationInput(renameServerCommandInputSchema, input).map(
      (parsed) =>
        new RenameServerCommand(
          parsed.serverId,
          parsed.name,
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}
