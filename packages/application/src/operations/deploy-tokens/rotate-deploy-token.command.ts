import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type RotateDeployTokenCommandInput,
  rotateDeployTokenCommandInputSchema,
} from "./rotate-deploy-token.schema";
import {
  type RotateDeployTokenUseCaseInput,
  type RotateDeployTokenUseCaseResult,
} from "./rotate-deploy-token.use-case";

export class RotateDeployTokenCommand extends Command<RotateDeployTokenUseCaseResult> {
  constructor(
    public readonly tokenId: string,
    public readonly organizationId: string,
    public readonly confirmation: RotateDeployTokenUseCaseInput["confirmation"],
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(input: RotateDeployTokenCommandInput): Result<RotateDeployTokenCommand> {
    return parseOperationInput(rotateDeployTokenCommandInputSchema, input).map(
      (parsed) =>
        new RotateDeployTokenCommand(
          parsed.tokenId,
          parsed.organizationId,
          parsed.confirmation,
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}

export {
  type RotateDeployTokenCommandInput,
  rotateDeployTokenCommandInputSchema,
} from "./rotate-deploy-token.schema";
