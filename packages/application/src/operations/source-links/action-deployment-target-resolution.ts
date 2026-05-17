import { type DomainError, err, ok, type Result } from "@appaloft/core";

import {
  type ActionDeployTokenResolvedScope,
  type SourceLinkRecord,
  type SourceLinkTarget,
} from "../../ports";

export interface TrustedActionDeploymentContext {
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

export interface ActionDeploymentResolutionContext {
  authorizedTokenScope?: ActionDeployTokenResolvedScope;
  trustedContext?: TrustedActionDeploymentContext;
}

export interface ResolvedActionDeploymentTarget extends SourceLinkTarget {
  reason: string;
  source: "explicit-context" | "source-link" | "token-scope";
}

export function hasExplicitDeploymentContext(
  trustedContext: TrustedActionDeploymentContext | undefined,
): boolean {
  return Boolean(
    trustedContext?.projectId ||
      trustedContext?.environmentId ||
      trustedContext?.resourceId ||
      trustedContext?.serverId ||
      trustedContext?.destinationId,
  );
}

export function hasCompleteExplicitDeploymentContext(
  trustedContext: TrustedActionDeploymentContext | undefined,
): boolean {
  return Boolean(
    trustedContext?.projectId &&
      trustedContext.environmentId &&
      trustedContext.resourceId &&
      trustedContext.serverId,
  );
}

export function completeExplicitDeploymentTarget(
  trustedContext: TrustedActionDeploymentContext,
): SourceLinkTarget {
  return {
    projectId: trustedContext.projectId ?? "",
    environmentId: trustedContext.environmentId ?? "",
    resourceId: trustedContext.resourceId ?? "",
    serverId: trustedContext.serverId ?? "",
    ...(trustedContext.destinationId ? { destinationId: trustedContext.destinationId } : {}),
  };
}

export function resolveActionDeploymentTarget(input: {
  authorizedTokenScope?: ActionDeployTokenResolvedScope;
  explicitContextReason: string;
  sourceFingerprint: string;
  sourceLink?: SourceLinkRecord | null;
  trustedContext?: TrustedActionDeploymentContext;
  unresolvedReasonCode?: string;
}): Result<ResolvedActionDeploymentTarget> {
  const trustedContext = input.trustedContext;
  const hasExplicitContext = hasExplicitDeploymentContext(trustedContext);

  if (hasExplicitContext && !hasCompleteExplicitDeploymentContext(trustedContext)) {
    return err(
      actionDeploymentTargetValidationError(
        "Action deployment target bootstrap requires project, environment, resource, and server ids",
        {
          reasonCode: "explicit-context-incomplete",
          sourceFingerprint: input.sourceFingerprint,
        },
      ),
    );
  }

  const explicitTarget =
    hasExplicitContext && trustedContext
      ? completeExplicitDeploymentTarget(trustedContext)
      : undefined;

  const explicitScopeFailure = explicitTarget
    ? targetScopeFailure(explicitTarget, input.authorizedTokenScope)
    : undefined;
  if (explicitScopeFailure) {
    return err(
      actionDeploymentTargetScopeError("Action deploy token scope conflicts with explicit ids", {
        ...explicitScopeFailure,
        sourceFingerprint: input.sourceFingerprint,
      }),
    );
  }

  const repositoryScopeFailure = repositoryScopeConflict(
    trustedContext,
    input.authorizedTokenScope,
  );
  if (repositoryScopeFailure) {
    return err(
      actionDeploymentTargetScopeError(
        "Action deploy token scope conflicts with trusted repository context",
        {
          ...repositoryScopeFailure,
          sourceFingerprint: input.sourceFingerprint,
        },
      ),
    );
  }

  if (input.sourceLink) {
    const linkScopeFailure = targetScopeFailure(input.sourceLink, input.authorizedTokenScope);
    if (linkScopeFailure) {
      return err(
        actionDeploymentTargetScopeError(
          "Action deploy token scope conflicts with existing source link",
          {
            ...linkScopeFailure,
            sourceFingerprint: input.sourceFingerprint,
          },
        ),
      );
    }

    if (explicitTarget && sourceLinkConflicts(input.sourceLink, explicitTarget)) {
      return err(
        actionDeploymentTargetConflictError(
          "Action deployment explicit context conflicts with existing source link; relink the source before deploying",
          {
            sourceFingerprint: input.sourceFingerprint,
          },
        ),
      );
    }

    return ok({
      projectId: input.sourceLink.projectId,
      environmentId: input.sourceLink.environmentId,
      resourceId: input.sourceLink.resourceId,
      ...(input.sourceLink.serverId ? { serverId: input.sourceLink.serverId } : {}),
      ...(input.sourceLink.destinationId ? { destinationId: input.sourceLink.destinationId } : {}),
      reason: input.sourceLink.reason ?? "existing-source-link",
      source: "source-link",
    });
  }

  if (explicitTarget) {
    return ok({
      ...explicitTarget,
      reason: input.explicitContextReason,
      source: "explicit-context",
    });
  }

  const tokenTarget = completeTokenScopedTarget(input.authorizedTokenScope);
  if (tokenTarget) {
    return ok({
      ...tokenTarget,
      reason: "github-action-token-scope",
      source: "token-scope",
    });
  }

  return err(
    actionDeploymentTargetUnresolvedError({
      reasonCode: input.unresolvedReasonCode ?? "target-context-required",
      sourceFingerprint: input.sourceFingerprint,
    }),
  );
}

export function sourceLinkRecordFromTarget(input: {
  reason: string;
  sourceFingerprint: string;
  target: SourceLinkTarget;
  updatedAt: string;
}): SourceLinkRecord {
  return {
    sourceFingerprint: input.sourceFingerprint,
    projectId: input.target.projectId,
    environmentId: input.target.environmentId,
    resourceId: input.target.resourceId,
    updatedAt: input.updatedAt,
    reason: input.reason,
    ...(input.target.serverId ? { serverId: input.target.serverId } : {}),
    ...(input.target.destinationId ? { destinationId: input.target.destinationId } : {}),
  };
}

function sourceLinkConflicts(link: SourceLinkTarget, target: SourceLinkTarget): boolean {
  return (
    link.projectId !== target.projectId ||
    link.environmentId !== target.environmentId ||
    link.resourceId !== target.resourceId ||
    link.serverId !== target.serverId ||
    Boolean(target.destinationId && link.destinationId !== target.destinationId)
  );
}

function completeTokenScopedTarget(
  scope: ActionDeployTokenResolvedScope | undefined,
): SourceLinkTarget | undefined {
  const projectId = single(scope?.projectIds);
  const environmentId = single(scope?.environmentIds);
  const resourceId = single(scope?.resourceIds);
  const serverId = single(scope?.serverIds);
  if (!projectId || !environmentId || !resourceId || !serverId) {
    return undefined;
  }

  return {
    projectId,
    environmentId,
    resourceId,
    serverId,
  };
}

function single(values: readonly string[] | undefined): string | undefined {
  return values?.length === 1 ? values[0] : undefined;
}

function targetScopeFailure(
  target: SourceLinkTarget,
  scope: ActionDeployTokenResolvedScope | undefined,
): Record<string, string> | undefined {
  if (!scope) {
    return undefined;
  }

  if (!includesOptional(scope.projectIds, target.projectId)) {
    return { missingScope: "project", projectId: target.projectId };
  }

  if (!includesOptional(scope.environmentIds, target.environmentId)) {
    return { missingScope: "environment", environmentId: target.environmentId };
  }

  if (!includesOptional(scope.resourceIds, target.resourceId)) {
    return { missingScope: "resource", resourceId: target.resourceId };
  }

  if (target.serverId && !includesOptional(scope.serverIds, target.serverId)) {
    return { missingScope: "server", serverId: target.serverId };
  }

  return undefined;
}

function repositoryScopeConflict(
  trustedContext: TrustedActionDeploymentContext | undefined,
  scope: ActionDeployTokenResolvedScope | undefined,
): Record<string, string> | undefined {
  if (
    trustedContext?.repositoryFullName &&
    !includesOptional(scope?.repositoryFullNames, trustedContext.repositoryFullName)
  ) {
    return {
      missingScope: "repository",
      repositoryFullName: trustedContext.repositoryFullName,
    };
  }

  return undefined;
}

function includesOptional(values: readonly string[] | undefined, value: string): boolean {
  return !values || values.length === 0 || values.includes(value);
}

function actionDeploymentTargetValidationError(
  message: string,
  details: Record<string, string>,
): DomainError {
  return {
    code: "validation_error",
    category: "user",
    message,
    retryable: false,
    details: {
      phase: "source-link-resolution",
      ...details,
    },
  };
}

function actionDeploymentTargetConflictError(
  message: string,
  details: Record<string, string>,
): DomainError {
  return {
    code: "action_deployment_target_conflict",
    category: "user",
    message,
    retryable: false,
    details: {
      phase: "source-link-resolution",
      ...details,
    },
  };
}

function actionDeploymentTargetScopeError(
  message: string,
  details: Record<string, string>,
): DomainError {
  return {
    code: "action_auth_forbidden",
    category: "user",
    message,
    retryable: false,
    details: {
      phase: "action-authorization",
      ...details,
    },
  };
}

function actionDeploymentTargetUnresolvedError(input: {
  reasonCode: string;
  sourceFingerprint: string;
}): DomainError {
  return {
    code: "action_deployment_target_unresolved",
    category: "user",
    message:
      "Action deployment target could not be resolved from source-link state, deploy token scope, or trusted bootstrap context",
    retryable: false,
    details: {
      phase: "source-link-resolution",
      reasonCode: input.reasonCode,
      sourceFingerprint: input.sourceFingerprint,
      nextActions: [
        "create-or-link-source-binding-in-console",
        "run-source-links-relink",
        "pass-one-time-trusted-bootstrap-ids",
      ],
    },
  };
}
