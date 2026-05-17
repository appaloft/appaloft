import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type ActionDeployTokenResolvedScope } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type CreateActionSourceLinkDeploymentCommandInput,
  type CreateActionSourceLinkDeploymentResponse,
  createActionSourceLinkDeploymentCommandInputSchema,
} from "./create-action-source-link-deployment.schema";

type TrustedActionSourceLinkDeploymentContext = {
  projectId?: string;
  environmentId?: string;
  resourceId?: string;
  serverId?: string;
  destinationId?: string;
  repositoryFullName?: string;
  repositoryId?: string;
  ref?: string;
  revision?: string;
};

export {
  type CreateActionSourceLinkDeploymentCommandInput,
  type CreateActionSourceLinkDeploymentResponse,
  createActionSourceLinkDeploymentCommandInputSchema,
  createActionSourceLinkDeploymentResponseSchema,
} from "./create-action-source-link-deployment.schema";

export class CreateActionSourceLinkDeploymentCommand extends Command<CreateActionSourceLinkDeploymentResponse> {
  constructor(
    public readonly sourceFingerprint: string,
    public readonly projectId?: string,
    public readonly environmentId?: string,
    public readonly resourceId?: string,
    public readonly serverId?: string,
    public readonly destinationId?: string,
    public readonly trustedContext?: TrustedActionSourceLinkDeploymentContext,
    public readonly authorizedTokenScope?: ActionDeployTokenResolvedScope,
  ) {
    super();
  }

  static create(
    input: CreateActionSourceLinkDeploymentCommandInput,
  ): Result<CreateActionSourceLinkDeploymentCommand> {
    return parseOperationInput(createActionSourceLinkDeploymentCommandInputSchema, input).map(
      (parsed) =>
        new CreateActionSourceLinkDeploymentCommand(
          parsed.sourceFingerprint,
          parsed.projectId,
          parsed.environmentId,
          parsed.resourceId,
          parsed.serverId,
          parsed.destinationId,
          trustedContextFromParsed(parsed),
          authorizedTokenScopeFromParsed(parsed.authorizedTokenScope),
        ),
    );
  }
}

function trustedContextFromParsed(parsed: {
  projectId?: string | undefined;
  environmentId?: string | undefined;
  resourceId?: string | undefined;
  serverId?: string | undefined;
  destinationId?: string | undefined;
  trustedContext?:
    | {
        projectId?: string | undefined;
        environmentId?: string | undefined;
        resourceId?: string | undefined;
        serverId?: string | undefined;
        destinationId?: string | undefined;
        repositoryFullName?: string | undefined;
        repositoryId?: string | undefined;
        ref?: string | undefined;
        revision?: string | undefined;
      }
    | undefined;
}): TrustedActionSourceLinkDeploymentContext | undefined {
  const trustedContext = parsed.trustedContext;
  const merged = {
    ...(parsed.projectId ? { projectId: parsed.projectId } : {}),
    ...(parsed.environmentId ? { environmentId: parsed.environmentId } : {}),
    ...(parsed.resourceId ? { resourceId: parsed.resourceId } : {}),
    ...(parsed.serverId ? { serverId: parsed.serverId } : {}),
    ...(parsed.destinationId ? { destinationId: parsed.destinationId } : {}),
    ...(trustedContext?.projectId ? { projectId: trustedContext.projectId } : {}),
    ...(trustedContext?.environmentId ? { environmentId: trustedContext.environmentId } : {}),
    ...(trustedContext?.resourceId ? { resourceId: trustedContext.resourceId } : {}),
    ...(trustedContext?.serverId ? { serverId: trustedContext.serverId } : {}),
    ...(trustedContext?.destinationId ? { destinationId: trustedContext.destinationId } : {}),
    ...(trustedContext?.repositoryFullName
      ? { repositoryFullName: trustedContext.repositoryFullName }
      : {}),
    ...(trustedContext?.repositoryId ? { repositoryId: trustedContext.repositoryId } : {}),
    ...(trustedContext?.ref ? { ref: trustedContext.ref } : {}),
    ...(trustedContext?.revision ? { revision: trustedContext.revision } : {}),
  };

  return Object.keys(merged).length > 0 ? merged : undefined;
}

function authorizedTokenScopeFromParsed(
  scope:
    | {
        environmentIds?: string[] | undefined;
        projectIds?: string[] | undefined;
        repositoryFullNames?: string[] | undefined;
        resourceIds?: string[] | undefined;
        serverIds?: string[] | undefined;
      }
    | undefined,
): ActionDeployTokenResolvedScope | undefined {
  if (!scope) {
    return undefined;
  }

  return {
    environmentIds: scope.environmentIds ?? [],
    projectIds: scope.projectIds ?? [],
    repositoryFullNames: scope.repositoryFullNames ?? [],
    resourceIds: scope.resourceIds ?? [],
    serverIds: scope.serverIds ?? [],
  };
}
