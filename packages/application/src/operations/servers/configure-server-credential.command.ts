import { type Result } from "@yundu/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type ConfigureServerCredentialCommandInput,
  configureServerCredentialCommandInputSchema,
} from "./configure-server-credential.schema";

export {
  type ConfigureServerCredentialCommandInput,
  configureServerCredentialCommandInputSchema,
} from "./configure-server-credential.schema";

export class ConfigureServerCredentialCommand extends Command<null> {
  constructor(
    public readonly serverId: string,
    public readonly credential: ConfigureServerCredentialCommandInput["credential"],
  ) {
    super();
  }

  static create(
    input: ConfigureServerCredentialCommandInput,
  ): Result<ConfigureServerCredentialCommand> {
    return parseOperationInput(configureServerCredentialCommandInputSchema, input).map(
      (parsed) => new ConfigureServerCredentialCommand(parsed.serverId, parsed.credential),
    );
  }
}
