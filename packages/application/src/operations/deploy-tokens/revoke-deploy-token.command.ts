import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type RevokeDeployTokenCommandInput,
  revokeDeployTokenCommandInputSchema,
} from "./revoke-deploy-token.schema";
import {
  type RevokeDeployTokenUseCaseInput,
  type RevokeDeployTokenUseCaseResult,
} from "./revoke-deploy-token.use-case";

export class RevokeDeployTokenCommand extends Command<RevokeDeployTokenUseCaseResult> {
  constructor(
    public readonly tokenId: string,
    public readonly organizationId: string,
    public readonly confirmation: RevokeDeployTokenUseCaseInput["confirmation"],
    public readonly reason?: string,
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(input: RevokeDeployTokenCommandInput): Result<RevokeDeployTokenCommand> {
    return parseOperationInput(revokeDeployTokenCommandInputSchema, input).map(
      (parsed) =>
        new RevokeDeployTokenCommand(
          parsed.tokenId,
          parsed.organizationId,
          parsed.confirmation,
          trimToUndefined(parsed.reason),
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}

export {
  type RevokeDeployTokenCommandInput,
  revokeDeployTokenCommandInputSchema,
} from "./revoke-deploy-token.schema";
