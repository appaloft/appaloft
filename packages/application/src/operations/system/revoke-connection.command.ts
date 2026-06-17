import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type ConnectionRevokeResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type RevokeConnectionCommandInput,
  revokeConnectionCommandInputSchema,
} from "./connections.schema";

export {
  type RevokeConnectionCommandInput,
  revokeConnectionCommandInputSchema,
} from "./connections.schema";

export class RevokeConnectionCommand extends Command<ConnectionRevokeResult> {
  constructor(readonly connectionId: string) {
    super();
  }

  static create(input: RevokeConnectionCommandInput): Result<RevokeConnectionCommand> {
    return parseOperationInput(revokeConnectionCommandInputSchema, input).map(
      (parsed) => new RevokeConnectionCommand(parsed.connectionId),
    );
  }
}
