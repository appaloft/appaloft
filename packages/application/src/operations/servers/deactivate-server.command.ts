import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type DeactivateServerCommandInput,
  deactivateServerCommandInputSchema,
} from "./deactivate-server.schema";

export {
  type DeactivateServerCommandInput,
  deactivateServerCommandInputSchema,
} from "./deactivate-server.schema";

export class DeactivateServerCommand extends Command<{ id: string }> {
  constructor(
    public readonly serverId: string,
    public readonly reason?: string,
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(input: DeactivateServerCommandInput): Result<DeactivateServerCommand> {
    return parseOperationInput(deactivateServerCommandInputSchema, input).map(
      (parsed) =>
        new DeactivateServerCommand(
          parsed.serverId,
          trimToUndefined(parsed.reason),
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}
