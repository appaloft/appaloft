import { type DomainEvent, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { EventHandler, type EventHandlerContract } from "./cqrs";
import { type ExecutionContext, toRepositoryContext } from "./execution-context";
import {
  type AppLogger,
  type AuditEventPayloadValue,
  type AuditEventRecorder,
  type Clock,
  type IdGenerator,
  type OperationAuditTargetRef,
} from "./ports";
import { tokens } from "./tokens";

const lifecycleEventTypes = [
  "project-renamed",
  "project-description-set",
  "project-reordered",
  "project-archived",
  "project-restored",
  "project-deleted",
  "resource-created",
  "resource-archived",
  "resource-restored",
  "resource-deleted",
  "resource-source-configured",
  "resource-runtime-configured",
  "resource-network-configured",
  "resource-access-configured",
  "resource-health-policy-configured",
  "resource-health-policy-reset",
  "resource-variable-set",
  "resource-variable-unset",
  "resource-secret-reference-created",
  "resource-secret-reference-rotated",
  "resource-secret-reference-deleted",
  "resource-dependency-binding-secret-rotated",
  "deployment-requested",
  "deployment-started",
  "deployment-succeeded",
  "deployment-failed",
  "deployment-archived",
  "dependency-resource-realization-requested",
  "dependency-resource-realized",
  "dependency-resource-realization-failed",
  "dependency-resource-provider-delete-requested",
  "dependency-resource-backup-requested",
  "dependency-resource-backup-completed",
  "dependency-resource-backup-failed",
  "dependency-resource-restore-requested",
  "dependency-resource-restore-completed",
  "dependency-resource-restore-failed",
  "domain-binding-requested",
  "domain-binding-route-configured",
  "domain-binding-verification-retried",
  "domain-bound",
  "domain-ready",
  "domain-route-realization-failed",
  "domain-binding-deleted",
  "server-connected",
  "server-ready",
  "server-renamed",
  "server-edge-proxy-configured",
  "server-deactivated",
  "server-deleted",
] as const;

const relatedTargetFields: Record<string, string> = {
  projectId: "project",
  environmentId: "environment",
  resourceId: "resource",
  serverId: "server",
  destinationId: "destination",
  deploymentId: "deployment",
  dependencyResourceId: "dependency_resource",
  dependencyBindingId: "dependency_binding",
  domainBindingId: "domain_binding",
  certificateId: "certificate",
  storageVolumeId: "storage_volume",
};

function LifecycleEventHandler(eventType: (typeof lifecycleEventTypes)[number]) {
  return EventHandler(eventType);
}

@LifecycleEventHandler("project-renamed")
@LifecycleEventHandler("project-description-set")
@LifecycleEventHandler("project-reordered")
@LifecycleEventHandler("project-archived")
@LifecycleEventHandler("project-restored")
@LifecycleEventHandler("project-deleted")
@LifecycleEventHandler("resource-created")
@LifecycleEventHandler("resource-archived")
@LifecycleEventHandler("resource-restored")
@LifecycleEventHandler("resource-deleted")
@LifecycleEventHandler("resource-source-configured")
@LifecycleEventHandler("resource-runtime-configured")
@LifecycleEventHandler("resource-network-configured")
@LifecycleEventHandler("resource-access-configured")
@LifecycleEventHandler("resource-health-policy-configured")
@LifecycleEventHandler("resource-health-policy-reset")
@LifecycleEventHandler("resource-variable-set")
@LifecycleEventHandler("resource-variable-unset")
@LifecycleEventHandler("resource-secret-reference-created")
@LifecycleEventHandler("resource-secret-reference-rotated")
@LifecycleEventHandler("resource-secret-reference-deleted")
@LifecycleEventHandler("resource-dependency-binding-secret-rotated")
@LifecycleEventHandler("deployment-requested")
@LifecycleEventHandler("deployment-started")
@LifecycleEventHandler("deployment-succeeded")
@LifecycleEventHandler("deployment-failed")
@LifecycleEventHandler("deployment-archived")
@LifecycleEventHandler("dependency-resource-realization-requested")
@LifecycleEventHandler("dependency-resource-realized")
@LifecycleEventHandler("dependency-resource-realization-failed")
@LifecycleEventHandler("dependency-resource-provider-delete-requested")
@LifecycleEventHandler("dependency-resource-backup-requested")
@LifecycleEventHandler("dependency-resource-backup-completed")
@LifecycleEventHandler("dependency-resource-backup-failed")
@LifecycleEventHandler("dependency-resource-restore-requested")
@LifecycleEventHandler("dependency-resource-restore-completed")
@LifecycleEventHandler("dependency-resource-restore-failed")
@LifecycleEventHandler("domain-binding-requested")
@LifecycleEventHandler("domain-binding-route-configured")
@LifecycleEventHandler("domain-binding-verification-retried")
@LifecycleEventHandler("domain-bound")
@LifecycleEventHandler("domain-ready")
@LifecycleEventHandler("domain-route-realization-failed")
@LifecycleEventHandler("domain-binding-deleted")
@LifecycleEventHandler("server-connected")
@LifecycleEventHandler("server-ready")
@LifecycleEventHandler("server-renamed")
@LifecycleEventHandler("server-edge-proxy-configured")
@LifecycleEventHandler("server-deactivated")
@LifecycleEventHandler("server-deleted")
@injectable()
export class OperationAuditDomainEventProjector implements EventHandlerContract<DomainEvent> {
  constructor(
    @inject(tokens.auditEventRecorder)
    private readonly recorder: AuditEventRecorder,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async handle(context: ExecutionContext, event: DomainEvent): Promise<Result<void>> {
    const primaryTarget = primaryTargetFromEvent(event);
    const relatedTargets = relatedTargetsFromPayload(event.payload, primaryTarget);
    const organizationId =
      stringValue(event.payload.organizationId) ?? context.tenant?.organizationId;
    const occurredAt = event.occurredAt || this.clock.now();

    const result = await this.recorder.record(toRepositoryContext(context), {
      id: this.idGenerator.next("aud"),
      aggregateId: primaryTarget.resourceId,
      eventType: event.type,
      payload: compactAuditPayload({
        schemaVersion: "domain-lifecycle-audit/v1",
        domainEventType: event.type,
        action: event.type,
        result: event.type.includes("failed") ? "failure" : "success",
        organizationId: organizationId ?? null,
        actorKind: context.actor?.kind ?? context.principal?.kind ?? "unknown",
        actorId:
          context.actor?.id ?? context.principal?.userId ?? context.principal?.actorId ?? null,
        actorLabel: context.actor?.label ?? context.principal?.email ?? null,
        resourceType: primaryTarget.resourceType,
        resourceId: primaryTarget.resourceId,
        relatedResourceIds: relatedTargets.map(
          (target) => `${target.resourceType}:${target.resourceId}`,
        ),
        requestId: context.requestId,
        entrypoint: context.entrypoint,
        tenantId: context.tenant?.tenantId ?? null,
        tenantMode: context.tenant?.mode ?? null,
      }),
      createdAt: occurredAt,
    });

    if (result.isErr()) {
      this.logger.warn("domain_event_audit_projection_failed", {
        eventType: event.type,
        aggregateId: event.aggregateId,
        errorCode: result.error.code,
      });
    }

    return ok(undefined);
  }
}

function primaryTargetFromEvent(event: DomainEvent): OperationAuditTargetRef {
  return {
    resourceType: resourceTypeFromEventType(event.type),
    resourceId: event.aggregateId,
  };
}

function resourceTypeFromEventType(eventType: string): string {
  if (eventType.startsWith("project-")) {
    return "project";
  }
  if (eventType.startsWith("resource-")) {
    return "resource";
  }
  if (eventType.startsWith("deployment-")) {
    return "deployment";
  }
  if (eventType.startsWith("dependency-resource-")) {
    return "dependency_resource";
  }
  if (eventType.startsWith("domain-")) {
    return "domain_binding";
  }
  if (eventType.startsWith("server-")) {
    return "server";
  }
  return "aggregate";
}

function relatedTargetsFromPayload(
  payload: Record<string, unknown>,
  primaryTarget: OperationAuditTargetRef,
): OperationAuditTargetRef[] {
  const targets: OperationAuditTargetRef[] = [];
  for (const [field, resourceType] of Object.entries(relatedTargetFields)) {
    const value = stringValue(payload[field]);
    if (!value) {
      continue;
    }
    if (primaryTarget.resourceType === resourceType && primaryTarget.resourceId === value) {
      continue;
    }
    targets.push({ resourceType, resourceId: value });
  }
  return uniqueTargets(targets);
}

function compactAuditPayload(
  input: Record<string, AuditEventPayloadValue | undefined>,
): Record<string, AuditEventPayloadValue> {
  const payload: Record<string, AuditEventPayloadValue> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      payload[key] = value;
    }
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
