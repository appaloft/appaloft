# resources.delete Command Spec

## Metadata

- Operation key: `resources.delete`
- Command class: `DeleteResourceCommand`
- Input schema: `DeleteResourceCommandInput`
- Handler: `DeleteResourceCommandHandler`
- Use case: `DeleteResourceUseCase`
- Domain / bounded context: Workload Delivery / Resource lifecycle
- Current status: active command
- Source classification: normative contract for delete implementation

## Normative Contract

`resources.delete` is the source-of-truth command for removing an archived resource from normal
active resource state only after deletion guards prove the resource is unreferenced.

Command success means normal active resource reads no longer expose the resource. It does not mean
deployments, domains, certificates, runtime instances, source links, dependency resources, logs, or
audit records were cascaded or cleaned up.

```ts
type DeleteResourceResult = Result<{ id: string }, DomainError>;
```

The command contract is:

- admission failure returns `err(DomainError)`;
- accepted success returns `ok({ id })`;
- accepted success transitions the resource to deleted lifecycle state or otherwise tombstones it
  so normal read paths omit it;
- accepted success publishes or records `resource-deleted` only for the first archived-to-deleted
  transition;
- deletion is allowed only for archived resources that pass all deletion guards.

## Global References

This command inherits:

- [ADR-011: Resource Create Minimum Lifecycle](../decisions/ADR-011-resource-create-minimum-lifecycle.md)
- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-026: Aggregate Mutation Command Boundary](../decisions/ADR-026-aggregate-mutation-command-boundary.md)
- [resources.archive Command Spec](./resources.archive.md)
- [resources.show Query Spec](../queries/resources.show.md)
- [resource-deleted Event Spec](../events/resource-deleted.md)
- [Resource Profile Lifecycle Workflow](../workflows/resource-profile-lifecycle.md)
- [Resource Lifecycle Error Spec](../errors/resources.lifecycle.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Purpose

Remove an unused resource shell from active Appaloft state when keeping it would only create
operator noise.

It is not:

- a generic resource update command;
- an archive command;
- a runtime cleanup command;
- a deployment history cleanup command;
- a domain, certificate, or route cleanup command;
- a source-link retargeting command;
- a cascading delete.

## Input Model

```ts
type DeleteResourceCommandInput = {
  resourceId: string;
  confirmation: {
    resourceSlug: string;
  };
  idempotencyKey?: string;
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `resourceId` | Required | Archived resource being deleted. |
| `confirmation.resourceSlug` | Required | Operator confirmation matching the current resource slug. |
| `idempotencyKey` | Optional | Deduplicates retries for the same delete request where supported. |

`confirmation.resourceSlug` must be normalized through the same resource slug rules used by the
`Resource` aggregate. It must match the resource's current slug exactly after normalization. A
mismatch returns `validation_error` with `phase = resource-deletion-guard` and must not publish an
event.

## Resource Lifecycle State

Delete completes the resource management lifecycle.

The `Resource` aggregate state must use value objects for lifecycle-significant fields rather than
raw strings:

- `ResourceLifecycleStatus` with `active`, `archived`, and `deleted`;
- `DeletedAt` for the terminal delete transition timestamp.

Allowed transition:

```text
archived -> deleted
```

Disallowed transitions:

```text
active -> deleted
deleted -> archived
deleted -> active
```

Active resources return `resource_delete_blocked` with `lifecycleStatus = "active"` and
`deletionBlockers` containing `active-resource`.

Deleted resources are terminal for normal command and query surfaces. If the write-side tombstone
can be resolved, repeated `resources.delete` retries may return idempotent `ok({ id })` without
publishing a duplicate `resource-deleted` event. If no resource or tombstone can be resolved, the
command returns `not_found`.

## Deletion Blockers

Deletion guards are application-level checks over write-side state and authoritative read models.
They must not rely on stale UI state.

Canonical blocker kinds:

```ts
type ResourceDeletionBlockerKind =
  | "active-resource"
  | "deployment-history"
  | "runtime-instance"
  | "domain-binding"
  | "certificate"
  | "source-link"
  | "dependency-binding"
  | "terminal-session"
  | "runtime-log-retention"
  | "audit-retention"
  | "generated-access-route"
  | "server-applied-route"
  | "proxy-route";
```

A blocker exists when any retained record, state, or external-facing route would make deletion
ambiguous or unsafe:

- `deployment-history`: any deployment attempt, deployment snapshot, deployment log projection, or
  rollback candidate references the resource.
- `runtime-instance`: any current or retained runtime instance record references the resource.
- `domain-binding`: any durable domain binding references the resource.
- `certificate`: any certificate or issuance/renewal attempt is tied to a resource-owned domain
  context.
- `source-link`: any source fingerprint link points to the resource.
- `dependency-binding`: any dependency resource, dependency binding, storage binding, or managed
  service binding references the resource.
- `terminal-session`: any open or retained terminal session references the resource.
- `runtime-log-retention`: retained runtime logs require the resource identity.
- `audit-retention`: audit policy requires the resource identity to remain queryable.
- `generated-access-route`, `server-applied-route`, or `proxy-route`: any durable desired/applied
  access route still references the resource.

The error payload must include only safe blocker kinds and safe identifiers/counts when available.
It must not include logs, route provider configs, source credentials, certificate material,
environment secret values, or provider credentials.

## Admission Flow

The command must:

1. Validate command input.
2. Resolve `resourceId` through a write-side path that can distinguish active/archived/deleted
   lifecycle state when tombstones are supported.
3. Reject missing or invisible resources with `not_found`.
4. Treat an already deleted resolvable tombstone as idempotent success without a duplicate event.
5. Reject active resources with `resource_delete_blocked`.
6. Verify `confirmation.resourceSlug` matches the current resource slug.
7. Check deletion guards for all canonical blocker kinds.
8. Return `resource_delete_blocked` with safe blocker details when any guard fails.
9. Capture delete time through the injected clock.
10. Persist deleted lifecycle state or tombstone active resource state so normal reads omit it.
11. Publish or record `resource-deleted` with a safe snapshot of deleted resource identity.
12. Return `ok({ id })`.

## Persistence And Read Model Rules

`resources.delete` may hard-delete the active row only if the implementation also preserves enough
safe tombstone or event state to support idempotency, audit policy, and event payload publication.

The preferred v1 implementation is:

```text
Resource(status = archived)
  -> Resource(status = deleted, deletedAt = now)
  -> active resource read models omit the row
  -> resource-deleted event records safe identity snapshot
```

Normal read paths after delete:

- `resources.show` returns `not_found`;
- `resources.list` omits the resource;
- compact navigation omits the resource;
- audit-only deleted-resource inspection requires a separate future query.

Repository and persistence code may use technical delete/update/tombstone mechanics internally.
Public operation keys, command classes, aggregate methods, domain events, Web/API/CLI actions, and
future MCP tools must remain intention-revealing and must not expose `resources.update`,
`resources.patch`, or `resource-updated`.

## Resource-Specific Rules

Delete is intentionally narrower than archive. Most real deployed resources should be archived,
not deleted, because deployment history, domain/TLS state, source links, runtime state, and support
context are product data.

The command must never perform implicit cleanup of runtime containers, proxy routes, domains,
certificates, source links, dependency resources, logs, or deployment records. Each cleanup path
needs its own explicit command or workflow before deletion can pass guards.

## Error Contract

All errors use [Resource Lifecycle Error Spec](../errors/resources.lifecycle.md).

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | `resourceId`, `confirmation`, or `idempotencyKey` shape is invalid. |
| `validation_error` | `resource-deletion-guard` | No | Confirmation slug does not match the current resource slug. |
| `not_found` | `resource-read` | No | Resource does not exist, is not visible, or no tombstone can be resolved for an already deleted resource. |
| `resource_delete_blocked` | `resource-deletion-guard` | No | Resource is active or at least one canonical deletion blocker exists. |
| `invariant_violation` | `resource-deletion-guard` | No | Resource lifecycle state cannot transition to deleted. |
| `infra_error` | `resource-read` | Conditional | Deletion blocker reads could not be safely assembled. |
| `infra_error` | `resource-persistence` | Conditional | Deleted lifecycle/tombstone state could not be safely persisted. |
| `infra_error` | `event-publication` | Conditional | `resource-deleted` could not be recorded before command success. |

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Resource detail destructive action dispatches this command only for archived resources after typed slug confirmation. | Active |
| CLI | `appaloft resource delete <resourceId> --confirm-slug <slug> [--json]`. | Active |
| oRPC / HTTP | `DELETE /api/resources/{resourceId}` using the command schema; JSON body carries `confirmation.resourceSlug`. | Active |
| Repository config files | Not applicable. Repository config cannot request destructive control-plane lifecycle deletion. | Not applicable |
| Automation / MCP | Future command/tool over the same operation key. | Future |

## Events

Canonical event spec:

- [resource-deleted](../events/resource-deleted.md): archived unreferenced resource was removed
  from normal active resource state.

## Current Implementation Notes And Migration Gaps

Resource deletion is active in `CORE_OPERATIONS.md`, `operation-catalog.ts`, application slices,
HTTP/oRPC, CLI, Web, Resource repository tombstone state, and normal read-model omission.

The v1 PG deletion blocker reader covers retained deployments, durable domain bindings,
certificates tied through domain bindings, retained provider runtime logs, audit logs whose
`aggregate_id` is the resource id, and source links whose `source_links.resource_id` is the
resource id. Dependency, terminal-session, and external route-store blocker detection remain
extension points on the same `ResourceDeletionBlockerReader` port where no durable PG table exists
yet.

The next specified blocker closure is server-applied route state. Once the
`server_applied_route_states` durable table and PG adapter land, rows whose `resource_id` matches
the target resource must report `server-applied-route` through the same deletion blocker flow and
must not be cascaded away by resource deletion.

## Open Questions

- None for the guarded delete boundary. Cleanup of retained blockers remains separate future
  behavior.
