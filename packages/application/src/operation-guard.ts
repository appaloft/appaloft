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
