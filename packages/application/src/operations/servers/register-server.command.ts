import { type Result } from "@yundu/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type RegisterServerCommandInput,
  registerServerCommandInputSchema,
} from "./register-server.schema";

export {
  type RegisterServerCommandInput,
  registerServerCommandInputSchema,
} from "./register-server.schema";

export class RegisterServerCommand extends Command<{ id: string }> {
  constructor(
    public readonly name: string,
    public readonly host: string,
    public readonly providerKey: string,
    public readonly port?: number,
  ) {
    super();
  }

  static create(input: RegisterServerCommandInput): Result<RegisterServerCommand> {
    return parseOperationInput(registerServerCommandInputSchema, input).map(
      (parsed) =>
        new RegisterServerCommand(parsed.name, parsed.host, parsed.providerKey, parsed.port),
    );
  }
}
