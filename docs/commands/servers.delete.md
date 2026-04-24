# servers.delete Command Spec

## Metadata

- Operation key: `servers.delete`
- Command class: `DeleteServerCommand`
- Input schema: `DeleteServerCommandInput`
- Handler: `DeleteServerCommandHandler`
- Use case: `DeleteServerUseCase`
- Domain / bounded context: Runtime topology / DeploymentTarget lifecycle
- Current status: active command
- Source classification: normative contract for guarded delete implementation

## Normative Contract

`servers.delete` is the source-of-truth command for removing an inactive deployment target/server
from normal target selection only after delete-safety guards prove the server has no retained
blockers.

Command success means normal server list/show target surfaces no longer expose the server. It does
not mean deployments, resources, domains, certificates, credentials, proxy routes, runtime logs,
terminal sessions, audit records, source links, or provider-owned runtime state were cascaded or
cleaned up.

```ts
type DeleteServerResult = Result<{ id: string }, DomainError>;
```

The command contract is:

- admission failure returns `err(DomainError)`;
- accepted success returns `ok({ id })`;
- accepted success transitions the server to deleted lifecycle state or tombstones it so normal
  read paths omit it;
- accepted success publishes or records `server-deleted` only for the first inactive-to-deleted
  transition;
- deletion is allowed only for inactive servers with no delete-check blockers.

## Global References

This command inherits:

- [ADR-004: Server Readiness State Storage](../decisions/ADR-004-server-readiness-state-storage.md)
- [ADR-026: Aggregate Mutation Command Boundary](../decisions/ADR-026-aggregate-mutation-command-boundary.md)
- [servers.deactivate Command Spec](./servers.deactivate.md)
- [servers.delete-check Query Spec](../queries/servers.delete-check.md)
- [server-deleted Event Spec](../events/server-deleted.md)
- [Deployment Target Lifecycle Workflow](../workflows/deployment-target-lifecycle.md)
- [Deployment Target Lifecycle Error Spec](../errors/servers.lifecycle.md)
- [Deployment Target Lifecycle Test Matrix](../testing/deployment-target-lifecycle-test-matrix.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

No new ADR is required for this slice. The behavior extends ADR-004's write-side lifecycle state
rule and ADR-026's intention-revealing aggregate mutation boundary without changing ownership scope,
workflow sequencing, or cross-aggregate cleanup policy.

## Purpose

Remove an unused server target from normal Appaloft operations when keeping it would only create
operator noise.

It is not:

- a generic server update command;
- a deactivate command;
- a runtime stop command;
- a deployment cancel command;
- a domain, certificate, route, credential, source-link, log, or audit cleanup command;
- a cascading delete.

## Input Model

```ts
type DeleteServerCommandInput = {
  serverId: string;
  confirmation: {
    serverId: string;
  };
  idempotencyKey?: string;
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `serverId` | Required | Inactive deployment target/server being deleted. |
| `confirmation.serverId` | Required | Operator confirmation matching the selected server id. |
| `idempotencyKey` | Optional | Deduplicates retries for the same delete request where supported. |

`confirmation.serverId` must match `serverId` exactly after trimming. A mismatch returns
`validation_error` with `phase = server-lifecycle-guard` and must not publish an event.

## Server Lifecycle State

Delete completes the server management lifecycle for normal target selection.

The `DeploymentTarget` aggregate state must use value objects for lifecycle-significant fields:

- `DeploymentTargetLifecycleStatus` with `active`, `inactive`, and `deleted`;
- `DeactivatedAt` for the prior deactivate transition when present;
- `DeletedAt` for the terminal delete transition timestamp.

Allowed transition:

```text
inactive -> deleted
```

Disallowed transitions:

```text
active -> deleted
deleted -> active
deleted -> inactive
```

Active servers return `server_delete_blocked` with `lifecycleStatus = "active"` and
`deletionBlockers` containing `active-server`.

Deleted servers are terminal for normal command and query surfaces. If the write-side tombstone can
be resolved, repeated `servers.delete` retries may return idempotent `ok({ id })` without
publishing a duplicate `server-deleted` event. If no server or tombstone can be resolved, the
command returns `not_found`.

## Deletion Blockers

Deletion guards must share `servers.delete-check` semantics. The delete command must call the same
`ServerDeletionBlockerReader` used by `servers.delete-check`; it must not assemble a parallel
blocker list in the command handler, transport adapter, Web surface, or CLI.

Canonical blocker kinds are those defined by `servers.delete-check`:

```ts
type ServerDeleteBlockerKind =
  | "active-server"
  | "deployment-history"
  | "active-deployment"
  | "resource-placement"
  | "domain-binding"
  | "certificate"
  | "credential"
  | "source-link"
  | "server-applied-route"
  | "default-access-policy"
  | "terminal-session"
  | "runtime-task"
  | "runtime-log-retention"
  | "audit-retention";
```

A blocker exists when any retained record, state, or external-facing route would make deletion
ambiguous or unsafe. Blocker payloads must include only safe blocker kinds, ids, entity types, and
counts. They must not include logs, route provider configs, private keys, SSH output, certificate
material, environment secret values, or provider credentials.

## Admission Flow

The command must:

1. Validate command input.
2. Resolve `serverId` through a write-side path that can distinguish active/inactive/deleted
   lifecycle state when tombstones are supported.
3. Reject missing or invisible servers with `not_found`.
4. Treat an already deleted resolvable tombstone as idempotent success without a duplicate event.
5. Reject active servers with `server_delete_blocked`.
6. Verify `confirmation.serverId` matches the selected server id.
7. Check deletion guards through `ServerDeletionBlockerReader`.
8. Return `server_delete_blocked` with safe blocker details when any guard fails.
9. Capture delete time through the injected clock.
10. Persist deleted lifecycle state or tombstone server state so normal reads omit it.
11. Publish or record `server-deleted` with a safe snapshot of deleted server identity.
12. Return `ok({ id })`.

## Persistence And Read Model Rules

`servers.delete` may hard-delete the active row only if the implementation also preserves enough
safe tombstone or event state to support idempotency, audit policy, and historical relationship
readability.

The preferred v1 implementation is soft delete:

```text
DeploymentTarget(status = inactive)
  -> DeploymentTarget(status = deleted, deletedAt = now)
  -> normal server read models omit the row
  -> server-deleted event records safe identity snapshot
```

Normal read paths after delete:

- `servers.show` returns `not_found`;
- `servers.list` omits the server;
- deployment-target selection and scheduler target lists omit the server;
- deployment, domain, certificate, route, log, and audit history may still reference the server id;
- audit-only deleted-server inspection requires a separate future query.

Repository and persistence code may use technical delete/update/tombstone mechanics internally.
Public operation keys, command classes, aggregate methods, domain events, Web/API/CLI actions, and
future MCP tools must remain intention-revealing and must not expose `servers.update`,
`servers.patch`, or `server-updated`.

## Error Contract

All errors use [Deployment Target Lifecycle Error Spec](../errors/servers.lifecycle.md).

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | `serverId`, `confirmation`, or `idempotencyKey` shape is invalid. |
| `validation_error` | `server-lifecycle-guard` | No | Confirmation server id does not match the selected server id. |
| `not_found` | `server-admission` | No | Server does not exist, is not visible, or no tombstone can be resolved for an already deleted server. |
| `server_delete_blocked` | `server-lifecycle-guard` | No | Server is active or at least one canonical deletion blocker exists. |
| `invariant_violation` | `server-lifecycle-guard` | No | DeploymentTarget lifecycle state cannot transition to deleted. |
| `infra_error` | `server-delete-check-read` | Conditional | Deletion blocker reads could not be safely assembled. |
| `infra_error` | `server-persistence` | Conditional | Deleted lifecycle/tombstone state could not be safely persisted. |
| `infra_error` | `event-publication` | Conditional | `server-deleted` could not be recorded before command success. |

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Server detail shows read-only delete eligibility. Destructive delete button remains deferred until typed confirmation UX is implemented. | Read-only / action gap |
| CLI | `appaloft server delete <serverId> --confirm <serverId> [--json]`. | Active |
| oRPC / HTTP | `DELETE /api/servers/{serverId}` using the command schema; JSON body carries `confirmation.serverId`. | Active |
| Repository config files | Not applicable. Repository config cannot request destructive control-plane lifecycle deletion. | Not applicable |
| Automation / MCP | Future command/tool over the same operation key. | Future |
| Public docs | Existing `server.deployment-target` anchor covers guarded delete semantics. | Active |

## Events

Canonical event spec:

- [server-deleted](../events/server-deleted.md): inactive unreferenced server was removed from
  normal target selection.

## Current Implementation Notes And Migration Gaps

The first active implementation uses soft delete / lifecycle `deleted` state because hard deletion
would conflict with historical deployment, route, log, and audit references. Normal list/show paths
omit deleted servers; historical read surfaces keep their existing server ids.

Web server detail remains read-only for delete eligibility. The destructive button and typed
confirmation modal are a Web action migration gap.

Terminal-session and external runtime-task blockers remain extension points until durable tables
exist, matching `servers.delete-check`.

## Open Questions

- None for guarded soft delete.
