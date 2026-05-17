import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type ActionDeployTokenResolvedScope } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ResolveActionServerConfigDeploymentTargetCommandInput,
  type ResolveActionServerConfigDeploymentTargetResponse,
  resolveActionServerConfigDeploymentTargetCommandInputSchema,
} from "./resolve-action-server-config-deployment-target.schema";

type TrustedActionServerConfigDeploymentContext = {
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
  type ResolveActionServerConfigDeploymentTargetCommandInput,
  type ResolveActionServerConfigDeploymentTargetResponse,
  resolveActionServerConfigDeploymentTargetCommandInputSchema,
  resolveActionServerConfigDeploymentTargetResponseSchema,
} from "./resolve-action-server-config-deployment-target.schema";

export class ResolveActionServerConfigDeploymentTargetCommand extends Command<ResolveActionServerConfigDeploymentTargetResponse> {
  constructor(
    public readonly sourceFingerprint: string,
    public readonly trustedContext?: TrustedActionServerConfigDeploymentContext,
    public readonly authorizedTokenScope?: ActionDeployTokenResolvedScope,
  ) {
    super();
  }

  static create(
    input: ResolveActionServerConfigDeploymentTargetCommandInput,
  ): Result<ResolveActionServerConfigDeploymentTargetCommand> {
    return parseOperationInput(
      resolveActionServerConfigDeploymentTargetCommandInputSchema,
      input,
    ).map(
      (parsed) =>
        new ResolveActionServerConfigDeploymentTargetCommand(
          parsed.sourceFingerprint,
          trustedContextFromParsed(parsed.trustedContext),
          authorizedTokenScopeFromParsed(parsed.authorizedTokenScope),
        ),
    );
  }
}

function trustedContextFromParsed(trustedContext?: {
  projectId?: string | undefined;
  environmentId?: string | undefined;
  resourceId?: string | undefined;
  serverId?: string | undefined;
  destinationId?: string | undefined;
  repositoryFullName?: string | undefined;
  repositoryId?: string | undefined;
  ref?: string | undefined;
  revision?: string | undefined;
}): TrustedActionServerConfigDeploymentContext | undefined {
  if (!trustedContext) {
    return undefined;
  }

  return {
    ...(trustedContext.projectId ? { projectId: trustedContext.projectId } : {}),
    ...(trustedContext.environmentId ? { environmentId: trustedContext.environmentId } : {}),
    ...(trustedContext.resourceId ? { resourceId: trustedContext.resourceId } : {}),
    ...(trustedContext.serverId ? { serverId: trustedContext.serverId } : {}),
    ...(trustedContext.destinationId ? { destinationId: trustedContext.destinationId } : {}),
    ...(trustedContext.repositoryFullName
      ? { repositoryFullName: trustedContext.repositoryFullName }
      : {}),
    ...(trustedContext.repositoryId ? { repositoryId: trustedContext.repositoryId } : {}),
    ...(trustedContext.ref ? { ref: trustedContext.ref } : {}),
    ...(trustedContext.revision ? { revision: trustedContext.revision } : {}),
  };
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
