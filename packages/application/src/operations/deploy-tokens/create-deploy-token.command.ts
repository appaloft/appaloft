import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type CreateDeployTokenCommandInput,
  createDeployTokenCommandInputSchema,
} from "./create-deploy-token.schema";
import {
  type CreateDeployTokenUseCaseInput,
  type CreateDeployTokenUseCaseResult,
} from "./create-deploy-token.use-case";

export class CreateDeployTokenCommand extends Command<CreateDeployTokenUseCaseResult> {
  constructor(
    public readonly organizationId: string,
    public readonly displayName: string,
    public readonly scope: CreateDeployTokenUseCaseInput["scope"],
    public readonly expiresAt?: string,
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(input: CreateDeployTokenCommandInput): Result<CreateDeployTokenCommand> {
    return parseOperationInput(createDeployTokenCommandInputSchema, input).map(
      (parsed) =>
        new CreateDeployTokenCommand(
          parsed.organizationId,
          parsed.displayName,
          toCreateDeployTokenScopeInput(parsed.scope),
          trimToUndefined(parsed.expiresAt),
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}

export {
  type CreateDeployTokenCommandInput,
  createDeployTokenCommandInputSchema,
} from "./create-deploy-token.schema";

function toCreateDeployTokenScopeInput(
  scope: typeof createDeployTokenCommandInputSchema._output.scope,
): CreateDeployTokenUseCaseInput["scope"] {
  return {
    ...(scope.deploymentTargetIds ? { deploymentTargetIds: scope.deploymentTargetIds } : {}),
    ...(scope.environmentIds ? { environmentIds: scope.environmentIds } : {}),
    ...(scope.projectIds ? { projectIds: scope.projectIds } : {}),
    ...(scope.repositoryFullNames ? { repositoryFullNames: scope.repositoryFullNames } : {}),
    ...(scope.resourceIds ? { resourceIds: scope.resourceIds } : {}),
    workflowCommands: scope.workflowCommands,
  };
}
