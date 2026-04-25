import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type SshCredentialUsageSummary } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type RotateSshCredentialCommandInput,
  type RotateSshCredentialCommandPayload,
  rotateSshCredentialCommandInputSchema,
} from "./rotate-ssh-credential.schema";

export {
  type RotateSshCredentialCommandInput,
  rotateSshCredentialCommandInputSchema,
} from "./rotate-ssh-credential.schema";

export interface RotateSshCredentialCommandOutput {
  schemaVersion: "credentials.rotate-ssh/v1";
  credential: {
    id: string;
    kind: "ssh-private-key";
    usernameConfigured: boolean;
    publicKeyConfigured: boolean;
    privateKeyConfigured: boolean;
    rotatedAt: string;
  };
  affectedUsage: SshCredentialUsageSummary;
}

export class RotateSshCredentialCommand extends Command<RotateSshCredentialCommandOutput> {
  constructor(
    public readonly credentialId: string,
    public readonly privateKey: string,
    public readonly confirmation: RotateSshCredentialCommandPayload["confirmation"],
    public readonly publicKey?: string | null,
    public readonly username?: string | null,
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(input: RotateSshCredentialCommandInput): Result<RotateSshCredentialCommand> {
    return parseOperationInput(rotateSshCredentialCommandInputSchema, input).map(
      (parsed) =>
        new RotateSshCredentialCommand(
          parsed.credentialId,
          parsed.privateKey,
          parsed.confirmation,
          parsed.publicKey,
          parsed.username,
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}
