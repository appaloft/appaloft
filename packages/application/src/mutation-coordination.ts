import { domainError, err, ok, type Result } from "@appaloft/core";
import { type ExecutionContext } from "./execution-context";
import {
  type CoordinationMode,
  type CoordinationOwner,
  type CoordinationPolicy,
  type CoordinationScope,
  type CoordinationScopeKind,
} from "./ports";

const defaultWaitTimeoutMs = 3 * 60_000;
const defaultRetryIntervalMs = 1_000;
const defaultLeaseTtlMs = 30_000;
const defaultHeartbeatIntervalMs = 10_000;

function policy(input: {
  operationKey: string;
  scopeKind: CoordinationScopeKind;
  mode: CoordinationMode;
}): CoordinationPolicy {
  return {
    ...input,
    waitTimeoutMs: defaultWaitTimeoutMs,
    retryIntervalMs: defaultRetryIntervalMs,
    leaseTtlMs: defaultLeaseTtlMs,
    heartbeatIntervalMs: defaultHeartbeatIntervalMs,
  };
}

export const mutationCoordinationPolicies = {
  createDeployment: policy({
    operationKey: "deployments.create",
    scopeKind: "resource-runtime",
    mode: "supersede-active",
  }),
  retryDeployment: policy({
    operationKey: "deployments.retry",
    scopeKind: "resource-runtime",
    mode: "serialize-with-bounded-wait",
  }),
  redeployDeployment: policy({
    operationKey: "deployments.redeploy",
    scopeKind: "resource-runtime",
    mode: "supersede-active",
  }),
  cleanupPreview: policy({
    operationKey: "deployments.cleanup-preview",
    scopeKind: "preview-lifecycle",
    mode: "serialize-with-bounded-wait",
  }),
  relinkSourceLink: policy({
    operationKey: "source-links.relink",
    scopeKind: "source-link",
    mode: "serialize-with-bounded-wait",
  }),
} as const;

export function createCoordinationOwner(
  context: ExecutionContext,
  label: string,
): CoordinationOwner {
  return {
    ownerId: context.requestId,
    label,
  };
}

export function coordinationTimeoutError(input: {
  message: string;
  policy: CoordinationPolicy;
  scope: CoordinationScope;
  waitedSeconds: number;
  retryAfterSeconds?: number;
}): ReturnType<typeof domainError.conflict> {
  return {
    code: "coordination_timeout",
    category: "timeout",
    message: input.message,
    retryable: true,
    details: {
      phase: "operation-coordination",
      coordinationScopeKind: input.scope.kind,
      coordinationScope: input.scope.key,
      coordinationMode: input.policy.mode,
      waitedSeconds: input.waitedSeconds,
      ...(input.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: input.retryAfterSeconds }),
    },
  };
}

export function validateCoordinationScope(scope: CoordinationScope): Result<CoordinationScope> {
  if (!scope.key.trim()) {
    return err(
      domainError.validation("Coordination scope key is required", {
        phase: "operation-coordination",
        coordinationScopeKind: scope.kind,
      }),
    );
  }

  return ok(scope);
}
