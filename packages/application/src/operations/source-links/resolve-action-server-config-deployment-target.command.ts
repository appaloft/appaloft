import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
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
  };
}
