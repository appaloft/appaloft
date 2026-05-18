import { domainError, err, ok, type Result } from "@appaloft/core";

import { type ExecutionContext } from "./execution-context";
import {
  findOperationCatalogEntryByMessageName,
  type OperationCatalogEntry,
} from "./operation-catalog";
import {
  type OperationCheckRequest,
  type OperationCheckResourceRefs,
  type OperationGuardDecision,
  type OperationGuardPort,
  type OperationScopeConstraint,
  type OperationScopeDecision,
  type OperationScopePort,
} from "./ports";

const resourceRefKeys = [
  "projectId",
  "environmentId",
  "resourceId",
  "serverId",
  "destinationId",
  "deploymentId",
  "dependencyResourceId",
  "storageVolumeId",
] as const;

export function operationActionFromKey(operationKey: string): string {
  return operationKey.split(".").at(-1) ?? operationKey;
}

export function operationCatalogEntryForMessage(
  message: unknown,
): OperationCatalogEntry | undefined {
  const messageName = message?.constructor?.name;
  return messageName ? findOperationCatalogEntryByMessageName(messageName) : undefined;
}

function readStringProperty(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object" || !(key in value)) {
    return undefined;
  }

  const property = (value as Record<string, unknown>)[key];
  return typeof property === "string" && property.trim() ? property : undefined;
}

function readResourceRefs(message: unknown): OperationCheckResourceRefs | undefined {
  const refs: OperationCheckResourceRefs = {};

  for (const key of resourceRefKeys) {
    const value = readStringProperty(message, key);
    if (value) {
      refs[key] = value;
    }
  }

  return Object.keys(refs).length > 0 ? refs : undefined;
}

export function createOperationCheckRequest(input: {
  context: ExecutionContext;
  entry: OperationCatalogEntry;
  message?: unknown;
  organizationId?: string;
  resourceRefs?: OperationCheckResourceRefs;
}): OperationCheckRequest {
  const { context, entry, message } = input;
  const activeOrganization = context.principal?.activeOrganization;
  const organizationId =
    input.organizationId ??
    readStringProperty(message, "organizationId") ??
    activeOrganization?.organizationId;
  const resourceRefs = {
    ...(readResourceRefs(message) ?? {}),
    ...(input.resourceRefs ?? {}),
  };

  return {
    operationKey: entry.key,
    operationName: entry.messageName,
    kind: entry.kind,
    action: operationActionFromKey(entry.key),
    ...(context.actor ? { actor: context.actor } : {}),
    ...(context.principal?.email ? { email: context.principal.email } : {}),
    ...(organizationId ? { organizationId } : {}),
    ...(activeOrganization?.productRole ? { productRole: activeOrganization.productRole } : {}),
    ...(activeOrganization?.role ? { organizationRole: activeOrganization.role } : {}),
    ...(context.principal?.userId ? { userId: context.principal.userId } : {}),
    ...(Object.keys(resourceRefs).length > 0 ? { resourceRefs } : {}),
    contextAttributes: {
      entrypoint: context.entrypoint,
      requestId: context.requestId,
    },
  };
}

export function operationGuardDeniedError(
  request: OperationCheckRequest,
  decision: OperationGuardDecision,
) {
  return domainError.operationCheckDenied("Operation check denied", {
    operationKey: request.operationKey,
    operationName: request.operationName,
    reason: decision.reason,
    ...(decision.deniedBy?.checkKey ? { checkKey: decision.deniedBy.checkKey } : {}),
    ...(decision.deniedBy?.kind ? { checkKind: decision.deniedBy.kind } : {}),
    ...(request.organizationId ? { organizationId: request.organizationId } : {}),
    ...(request.resourceRefs?.projectId ? { projectId: request.resourceRefs.projectId } : {}),
    ...(request.resourceRefs?.environmentId
      ? { environmentId: request.resourceRefs.environmentId }
      : {}),
    ...(request.resourceRefs?.resourceId ? { resourceId: request.resourceRefs.resourceId } : {}),
    ...(request.resourceRefs?.serverId ? { serverId: request.resourceRefs.serverId } : {}),
    ...(decision.details ?? {}),
  });
}

export async function checkOperationGuards(input: {
  context: ExecutionContext;
  entry: OperationCatalogEntry;
  message?: unknown;
  operationGuardPort: OperationGuardPort;
  organizationId?: string;
  resourceRefs?: OperationCheckResourceRefs;
}): Promise<Result<void>> {
  const request = createOperationCheckRequest(input);
  const decision = await input.operationGuardPort.checkOperation(input.context, request);

  if (!decision.allowed) {
    return err(operationGuardDeniedError(request, decision));
  }

  return ok(undefined);
}

export const createOperationAuthorizationRequest = createOperationCheckRequest;
export const authorizeOperation = checkOperationGuards;

export function operationScopeDeniedError(
  request: OperationCheckRequest,
  decision: Extract<OperationScopeDecision, { effect: "deny" }>,
) {
  return domainError.operationCheckDenied("Operation scope denied", {
    operationKey: request.operationKey,
    operationName: request.operationName,
    reason: decision.reason,
    ...(decision.deniedBy?.checkKey ? { checkKey: decision.deniedBy.checkKey } : {}),
    ...(decision.deniedBy?.kind ? { checkKind: decision.deniedBy.kind } : {}),
    ...(request.organizationId ? { organizationId: request.organizationId } : {}),
    ...(request.resourceRefs?.projectId ? { projectId: request.resourceRefs.projectId } : {}),
    ...(request.resourceRefs?.environmentId
      ? { environmentId: request.resourceRefs.environmentId }
      : {}),
    ...(request.resourceRefs?.resourceId ? { resourceId: request.resourceRefs.resourceId } : {}),
    ...(request.resourceRefs?.serverId ? { serverId: request.resourceRefs.serverId } : {}),
    ...(decision.details ?? {}),
  });
}

export async function scopeOperation(input: {
  context: ExecutionContext;
  entry: OperationCatalogEntry;
  message?: unknown;
  operationScopePort: OperationScopePort;
  organizationId?: string;
  resourceRefs?: OperationCheckResourceRefs;
}): Promise<Result<OperationScopeDecision>> {
  const request = createOperationCheckRequest(input);
  const decision = await input.context.tracer.startActiveSpan(
    operationScopeSpanName(request.operationKey),
    {
      attributes: {
        "appaloft.operation.key": request.operationKey,
        "appaloft.operation.name": request.operationName,
        "appaloft.operation.scope.kind": request.kind,
        ...(request.organizationId ? { "appaloft.organization.id": request.organizationId } : {}),
      },
    },
    async (span) => {
      const scoped = await input.operationScopePort.scopeOperation(input.context, request);
      span.setAttribute("appaloft.operation.scope.effect", scoped.effect);
      span.setAttribute("appaloft.operation.scope.reason", scoped.reason);
      if (scoped.effect === "allow") {
        span.setAttribute("appaloft.operation.scope.visibility", scoped.visibility);
        span.setStatus("ok", scoped.reason);
      } else {
        span.setStatus("error", scoped.reason);
      }
      if (scoped.traceAttributes) {
        span.setAttributes(scoped.traceAttributes);
      }
      return scoped;
    },
  );

  if (decision.effect === "deny") {
    return err(operationScopeDeniedError(request, decision));
  }

  return ok(decision);
}

export function constraintsByKind(
  constraints: readonly OperationScopeConstraint[] | undefined,
  kind: OperationScopeConstraint["kind"],
): string[] | undefined {
  const values = constraints
    ?.filter((constraint) => constraint.kind === kind && constraint.operator === "in")
    .flatMap((constraint) => constraint.values)
    .filter((value) => value.trim().length > 0);

  if (!values?.length) {
    return undefined;
  }

  return [...new Set(values)];
}

export const scopeOperationVisibility = scopeOperation;

function operationScopeSpanName(operationKey: string): string {
  return `appaloft.operation_scope.${operationKey
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()}`;
}
