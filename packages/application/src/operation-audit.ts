import { domainError, err, ok, type Result } from "@appaloft/core";

import { type Command } from "./cqrs";
import { type ExecutionContext, toRepositoryContext } from "./execution-context";
import { type OperationCatalogEntry } from "./operation-catalog";
import {
  createOperationCheckRequest,
  operationActionFromKey,
  operationCatalogEntryForMessage,
} from "./operation-guard";
import {
  type AppLogger,
  type AuditEventPayloadValue,
  type AuditEventRecorder,
  type Clock,
  type IdGenerator,
  type OperationAuditActorRef,
  type OperationAuditRecordInput,
  type OperationAuditSink,
  type OperationAuditTargetRef,
} from "./ports";

const auditedDomains = new Set([
  "projects",
  "resources",
  "deployments",
  "dependency-resources",
  "domain-bindings",
  "servers",
  "static-artifacts",
  "storage-volumes",
  "credentials",
]);

const ignoredOperationKeys = new Set([
  "servers.test-connectivity",
  "servers.test-draft-connectivity",
  "deployments.prune",
  "resources.runtime-logs.archive",
  "resources.runtime-log-archives.prune",
  "resources.runtime-control-attempts.prune",
  "storage-volumes.cleanup-runtime",
  "storage-volumes.prune-backups",
  "servers.capacity.prune",
]);

const resourceTypeByDomain: Record<string, string> = {
  projects: "project",
  resources: "resource",
  deployments: "deployment",
  "dependency-resources": "dependency_resource",
  "domain-bindings": "domain_binding",
  servers: "server",
  "static-artifacts": "static_artifact",
  "storage-volumes": "storage_volume",
  credentials: "ssh_credential",
};

const targetFieldByDomain: Record<string, readonly string[]> = {
  projects: ["projectId", "id"],
  resources: ["resourceId", "id"],
  deployments: ["deploymentId", "id"],
  "dependency-resources": ["dependencyResourceId", "id"],
  "domain-bindings": ["domainBindingId", "id"],
  servers: ["serverId", "id"],
  "static-artifacts": ["artifactId", "publicationId", "resourceId", "id"],
  "storage-volumes": ["storageVolumeId", "id"],
  credentials: ["credentialId", "sshCredentialId", "id"],
};

const relatedTargetFields: Record<string, string> = {
  projectId: "project",
  environmentId: "environment",
  resourceId: "resource",
  serverId: "server",
  destinationId: "destination",
  deploymentId: "deployment",
  dependencyResourceId: "dependency_resource",
  storageVolumeId: "storage_volume",
  domainBindingId: "domain_binding",
  artifactId: "static_artifact",
  publicationId: "static_artifact_publication",
};

const secretLikeKeyPattern =
  /(authorization|certificate|credential|env|password|payload|private|secret|signature|token|value)/i;

export class DefaultOperationAuditSink implements OperationAuditSink {
  constructor(
    private readonly recorder: AuditEventRecorder,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
    private readonly logger: AppLogger,
  ) {}

  async recordOperation(
    context: ExecutionContext,
    input: OperationAuditRecordInput,
  ): Promise<Result<void>> {
    const primaryTarget = input.primaryTarget ?? {
      resourceType: input.domain,
      resourceId: input.organizationId ?? context.tenant?.tenantId ?? context.requestId,
    };
    const occurredAt = input.occurredAt ?? this.clock.now();
    const payload = operationAuditPayload(context, input, primaryTarget);

    try {
      const recorded = await this.recorder.record(toRepositoryContext(context), {
        id: this.idGenerator.next("aud"),
        aggregateId: primaryTarget.resourceId,
        eventType: input.operationKey,
        payload,
        createdAt: occurredAt,
      });

      if (recorded.isErr()) {
        this.logger.warn("Operation audit event could not be recorded", {
          operationKey: input.operationKey,
          resourceType: primaryTarget.resourceType,
          resourceId: primaryTarget.resourceId,
        });
        return recorded;
      }

      return ok(undefined);
    } catch (error) {
      this.logger.warn("Operation audit event could not be recorded", {
        operationKey: input.operationKey,
        resourceType: primaryTarget.resourceType,
        resourceId: primaryTarget.resourceId,
        ...(error instanceof Error ? { error: error.message } : {}),
      });
      return err(domainError.infra("Operation audit event could not be recorded"));
    }
  }
}

export function operationAuditRecordFromCommand(input: {
  context: ExecutionContext;
  command: Command<unknown>;
  result: Result<unknown>;
}): OperationAuditRecordInput | null {
  const entry = operationCatalogEntryForMessage(input.command);
  if (!entry || !isAuditedOperation(entry)) {
    return null;
  }

  const request = createOperationCheckRequest({
    context: input.context,
    entry,
    message: input.command,
  });
  const result = input.result.isOk() ? "success" : "failure";
  const commandObject = input.command as unknown as Record<string, unknown>;
  const successValue = input.result.isOk()
    ? (input.result.value as Record<string, unknown> | undefined)
    : undefined;
  const primaryTarget = primaryTargetFor(entry, commandObject, successValue);
  const relatedTargets = relatedTargetsFor(commandObject, successValue, primaryTarget);
  const actor = actorFromContext(input.context);

  return {
    operationKey: entry.key,
    operationName: entry.messageName,
    domain: entry.domain,
    action: operationActionFromKey(entry.key),
    result,
    ...(request.organizationId ? { organizationId: request.organizationId } : {}),
    ...(actor ? { actor } : {}),
    ...(primaryTarget ? { primaryTarget } : {}),
    ...(relatedTargets.length > 0 ? { relatedTargets } : {}),
    ...(input.result.isErr() ? { errorReason: input.result.error.code } : {}),
    metadata: {
      requestId: input.context.requestId,
      entrypoint: input.context.entrypoint,
      ...(input.context.tenant?.tenantId ? { tenantId: input.context.tenant.tenantId } : {}),
      ...(input.context.tenant?.mode ? { tenantMode: input.context.tenant.mode } : {}),
    },
  };
}

function isAuditedOperation(entry: OperationCatalogEntry): boolean {
  return (
    entry.kind === "command" &&
    auditedDomains.has(entry.domain) &&
    !ignoredOperationKeys.has(entry.key)
  );
}

function primaryTargetFor(
  entry: OperationCatalogEntry,
  command: Record<string, unknown>,
  result: Record<string, unknown> | undefined,
): OperationAuditTargetRef | undefined {
  const resourceType = resourceTypeByDomain[entry.domain] ?? entry.domain;
  const fields = targetFieldByDomain[entry.domain] ?? ["id"];

  for (const field of fields) {
    const value = stringValue(result?.[field]) ?? stringValue(command[field]);
    if (value) {
      return { resourceType, resourceId: value };
    }
  }

  return undefined;
}

function relatedTargetsFor(
  command: Record<string, unknown>,
  result: Record<string, unknown> | undefined,
  primaryTarget: OperationAuditTargetRef | undefined,
): OperationAuditTargetRef[] {
  const targets: OperationAuditTargetRef[] = [];

  for (const [field, resourceType] of Object.entries(relatedTargetFields)) {
    const value = stringValue(command[field]) ?? stringValue(result?.[field]);
    if (!value) {
      continue;
    }
    if (primaryTarget?.resourceType === resourceType && primaryTarget.resourceId === value) {
      continue;
    }
    targets.push({ resourceType, resourceId: value });
  }

  return uniqueTargets(targets);
}

function actorFromContext(context: ExecutionContext): OperationAuditActorRef | undefined {
  const actor = context.actor;
  if (actor) {
    return {
      kind: actor.kind,
      id: actor.id,
      ...(actor.label ? { label: actor.label } : {}),
    };
  }

  const principal = context.principal;
  if (principal) {
    return {
      kind: principal.kind,
      id: principal.userId ?? principal.actorId,
      ...(principal.email ? { label: principal.email } : {}),
    };
  }

  return undefined;
}

function operationAuditPayload(
  context: ExecutionContext,
  input: OperationAuditRecordInput,
  primaryTarget: OperationAuditTargetRef,
): Record<string, AuditEventPayloadValue> {
  const relatedTargets = input.relatedTargets ?? [];
  return compactAuditPayload({
    schemaVersion: "operation-audit/v1",
    operationKey: input.operationKey,
    operationName: input.operationName,
    action: input.action,
    domain: input.domain,
    result: input.result,
    organizationId: input.organizationId ?? context.tenant?.organizationId ?? null,
    actorKind: input.actor?.kind ?? "unknown",
    actorId: input.actor?.id ?? null,
    actorLabel: input.actor?.label ?? null,
    resourceType: primaryTarget.resourceType,
    resourceId: primaryTarget.resourceId,
    relatedResourceIds: relatedTargets.map(
      (target) => `${target.resourceType}:${target.resourceId}`,
    ),
    requestId: context.requestId,
    entrypoint: context.entrypoint,
    tenantId: context.tenant?.tenantId ?? null,
    tenantMode: context.tenant?.mode ?? null,
    errorReason: input.errorReason ?? null,
    ...(input.metadata ?? {}),
  });
}

function compactAuditPayload(
  input: Record<string, AuditEventPayloadValue | undefined>,
): Record<string, AuditEventPayloadValue> {
  const payload: Record<string, AuditEventPayloadValue> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || secretLikeKeyPattern.test(key)) {
      continue;
    }
    payload[key] = value;
  }
  return payload;
}

function uniqueTargets(targets: OperationAuditTargetRef[]): OperationAuditTargetRef[] {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = `${target.resourceType}:${target.resourceId}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
