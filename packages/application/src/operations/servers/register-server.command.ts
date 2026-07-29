import { HostAddress, type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type RegisterServerCommandInput,
  type RegisterServerCommandPayload,
  type RegisterServerResult,
  registerServerCommandInputSchema,
} from "./register-server.schema";

export {
  type RegisterServerCommandInput,
  type RegisterServerCommandPayload,
  type RegisterServerResult,
  registerServerCommandInputSchema,
  registerServerResultSchema,
} from "./register-server.schema";

export class RegisterServerCommand extends Command<RegisterServerResult> {
  constructor(
    public readonly name: string,
    public readonly host: string,
    public readonly providerKey: string,
    public readonly workloadRoles: RegisterServerCommandPayload["workloadRoles"] = [],
    public readonly targetKind: RegisterServerCommandInput["targetKind"] = "single-server",
    public readonly port?: number,
    public readonly proxyKind: RegisterServerCommandInput["proxyKind"] = "traefik",
  ) {
    super();
  }

  static create(input: RegisterServerCommandInput): Result<RegisterServerCommand> {
    return parseOperationInput(registerServerCommandInputSchema, input).andThen((parsed) =>
      HostAddress.create(parsed.host).map(
        (host) =>
          new RegisterServerCommand(
            parsed.name,
            host.value,
            parsed.providerKey,
            parsed.workloadRoles,
            parsed.targetKind,
            parsed.port,
            parsed.proxyKind,
          ),
      ),
    );
  }
}
