import { type Result } from "@yundu/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type CreateSshCredentialCommandInput,
  createSshCredentialCommandInputSchema,
} from "./create-ssh-credential.schema";

export {
  type CreateSshCredentialCommandInput,
  createSshCredentialCommandInputSchema,
} from "./create-ssh-credential.schema";

export class CreateSshCredentialCommand extends Command<{ id: string }> {
  constructor(
    public readonly name: string,
    public readonly kind: CreateSshCredentialCommandInput["kind"],
    public readonly privateKey: string,
    public readonly username?: string,
    public readonly publicKey?: string,
  ) {
    super();
  }

  static create(input: CreateSshCredentialCommandInput): Result<CreateSshCredentialCommand> {
    return parseOperationInput(createSshCredentialCommandInputSchema, input).map(
      (parsed) =>
        new CreateSshCredentialCommand(
          parsed.name,
          parsed.kind,
          parsed.privateKey,
          parsed.username,
          parsed.publicKey,
        ),
    );
  }
}
