# servers.rename Command Spec

## Metadata

- Operation key: `servers.rename`
- Command class: `RenameServerCommand`
- Input schema: `RenameServerCommandInput`
- Handler: `RenameServerCommandHandler`
- Use case: `RenameServerUseCase`
- Domain / bounded context: Runtime topology / DeploymentTarget lifecycle
- Current status: active command
- Source classification: normative contract

## Normative Contract

`servers.rename` is the source-of-truth command for changing only the operator-facing display name
of a deployment target/server.

Command success means future server list/detail reads show the new name. It does not change the
server id, host, port, provider key, credential relationship, edge proxy intent/status, lifecycle
status, destination ids, deployment history, domain history, route state, logs, audit records, or
other historical references.

```ts
type RenameServerResult = Result<{ id: string }, DomainError>;
```

The command contract is:

- admission failure returns `err(DomainError)`;
- accepted success returns `ok({ id })`;
- accepted success persists the new `DeploymentTarget.name`;
- accepted success publishes or records `server-renamed` only when the normalized name changes;
- renaming an active or inactive server is allowed;
- deleted server tombstones are immutable through the ordinary rename entrypoint and return
  `not_found` from normal command admission.

## Global References

This command inherits:

- [ADR-004: Server Readiness State Storage](../decisions/ADR-004-server-readiness-state-storage.md)
- [ADR-026: Aggregate Mutation Command Boundary](../decisions/ADR-026-aggregate-mutation-command-boundary.md)
- [server-renamed Event Spec](../events/server-renamed.md)
- [Deployment Target Lifecycle Workflow](../workflows/deployment-target-lifecycle.md)
- [Deployment Target Lifecycle Error Spec](../errors/servers.lifecycle.md)
- [Deployment Target Lifecycle Test Matrix](../testing/deployment-target-lifecycle-test-matrix.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

No new ADR is required for this slice. The behavior extends ADR-026's intention-revealing aggregate
mutation boundary and ADR-004's durable write-side lifecycle facts without changing ownership
scope, lifecycle sequencing, readiness semantics, or cross-aggregate cleanup policy.

## Purpose

Rename a server so operators can distinguish deployment targets by a clearer label while keeping
all durable relationships anchored by the stable server id.

It is not:

- a generic server update command;
- a host, port, provider, credential, proxy, lifecycle, destination, route, or runtime change;
- a deactivation, delete, reactivation, connectivity test, proxy repair, or credential command;
- a migration of deployment, domain, route, log, or audit history.

## Input Model

```ts
type RenameServerCommandInput = {
  serverId: string;
  name: string;
  idempotencyKey?: string;
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `serverId` | Required | Active or inactive deployment target/server being renamed. |
| `name` | Required | New display name normalized by `DeploymentTargetName`. |
| `idempotencyKey` | Optional | Deduplicates retries for the same rename request where supported. |

`name` must reuse the existing `DeploymentTargetName` value object rules. It is trimmed, must be
non-empty, and must satisfy the shared required-text validation contract.

There is no server-name uniqueness invariant in the current domain or persistence model. Server
names are display names, not identity, route keys, slugs, provider-native ids, or placement
coordinates. Users and automation must use `serverId` for durable references. A future unique-name
constraint would require a separate Spec Round that defines a stable conflict code and migration
policy before implementation.

## Server Lifecycle State

Allowed lifecycle states:

```text
active -> active with new display name
inactive -> inactive with new display name
```

Disallowed ordinary rename state:

```text
deleted -> not_found from normal command admission
```

Rename must preserve all lifecycle fields:

- `lifecycleStatus`;
- `deactivatedAt`;
- `deactivationReason`;
- `deletedAt` when a tombstone is resolved internally for idempotent delete behavior;
- edge proxy state;
- credential state;
- host, port, provider key, target kind, and created timestamp.

## Admission Flow

The command must:

1. Validate command input.
2. Normalize `name` through `DeploymentTargetName`.
3. Resolve `serverId` through the write-side server repository.
4. Reject missing or invisible servers with `not_found`.
5. Treat resolvable deleted tombstones as ordinary-command `not_found`.
6. Return idempotent `ok({ id })` without an event when the normalized name is unchanged.
7. Persist the renamed server aggregate.
8. Publish or record `server-renamed` after the name is durable.
9. Return `ok({ id })`.

## Read Model Rules

After success:

- `servers.list` returns the new name;
- `servers.show` returns the new name;
- target-selection surfaces show the new name for active servers;
- inactive server detail and delete-check surfaces show the new name;
- historical deployment, domain, route, log, audit, and support records remain keyed by the same
  server id and do not require migration.

## Error Contract

All errors use [Deployment Target Lifecycle Error Spec](../errors/servers.lifecycle.md).

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | `serverId`, `name`, or `idempotencyKey` shape is invalid. |
| `not_found` | `server-admission` | No | Server does not exist, is not visible, or is a deleted tombstone hidden from ordinary rename. |
| `invariant_violation` | `server-lifecycle-guard` | No | DeploymentTarget rejects the rename invariant. |
| `infra_error` | `server-persistence` | Conditional | Renamed server state could not be safely persisted. |
| `infra_error` | `event-publication` | Conditional | `server-renamed` could not be recorded before command success. |

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Server detail provides a display-name text input/action for active and inactive servers. Deleted servers are not visible from normal detail. | Active when implemented |
| CLI | `appaloft server rename <serverId> --name <name> [--json]`. | Active |
| oRPC / HTTP | `POST /api/servers/{serverId}/rename` using the command schema. | Active |
| Repository config files | Not applicable. Repository config cannot rename deployment targets. | Not applicable |
| Automation / MCP | Future command/tool over the same operation key. | Future |
| Public docs | Existing `server.deployment-target` anchor covers server display-name semantics. | Active |

## Events

Canonical event spec:

- [server-renamed](../events/server-renamed.md): server display name changed.

## Current Implementation Notes And Migration Gaps

The intended first active implementation exposes API/oRPC and CLI closure and updates list/show
read-model visibility. Web server detail may expose the rename action if the existing detail page
can carry a small display-name form without broad redesign; otherwise the Web action is recorded as
a migration gap while the detail page continues to show the renamed value after API/CLI changes.

## Open Questions

- None for display-name-only rename semantics.
