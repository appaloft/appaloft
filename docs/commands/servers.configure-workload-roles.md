# servers.configure-workload-roles Command Spec

## Metadata

- Operation key: `servers.configure-workload-roles`
- Command class: `ConfigureServerWorkloadRolesCommand`
- Input schema: `ConfigureServerWorkloadRolesCommandInput`
- Handler: `ConfigureServerWorkloadRolesCommandHandler`
- Use case: `ConfigureServerWorkloadRolesUseCase`
- Domain / bounded context: Runtime topology / DeploymentTarget workload admission intent
- Current status: active command
- Source classification: normative contract

## Normative Contract

`servers.configure-workload-roles` is the source-of-truth command for replacing a registered
server's complete Server Workload Role set.

The role set expresses operator intent for **new placement only**. It does not stop, move, evict,
cancel, delete, orphan, or reinterpret an existing Deployment, build attempt, Sandbox, Workspace,
Run, or historical binding. It also does not change server lifecycle, connectivity, readiness,
target kind, provider, credentials, edge proxy, health, capacity, isolation evidence, or private
placement policy.

The canonical values are exactly:

- `deployment-runtime`;
- `artifact-builder`;
- `sandbox-worker`.

An empty set, `[]`, means general-purpose/unrestricted by role for every defined workload category.
It does not mean that the server accepts no workloads. Role admission remains necessary but never
sufficient: lifecycle, readiness, capability, provider, isolation, health, capacity, and private
policy gates remain independent.

## Global References

This command inherits:

- [ADR-101: Server Workload Role Admission](../decisions/ADR-101-server-workload-role-admission.md)
- [Server Workload Roles Spec](../specs/118-server-workload-roles/spec.md)
- [Server Workload Role Test Matrix](../testing/server-workload-role-test-matrix.md)
- [Server Register Or Connect Spec](./servers.register-or-connect.md)
- [servers.show Query Spec](../queries/servers.show.md)
- [Deployment Target Lifecycle Error Spec](../errors/servers.lifecycle.md)
- [deployment_target.workload_roles_configured Event Spec](../events/deployment-target-workload-roles-configured.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Purpose

Replace the server's complete intended workload-category set through one intention-revealing
aggregate mutation. The command is not a generic server update and does not expose incremental
add/remove operations.

`artifact-builder` is declaration/readback intent only until a governed neutral artifact-builder
executor exists. `sandbox-worker` does not prove Sandbox isolation or provider capability, and
Server-aware Sandbox enforcement remains a governed follow-up until the neutral placement contract
carries Server identity.

## Input Model

```ts
type ConfigureServerWorkloadRolesCommandInput = {
  serverId: string;
  workloadRoles: ServerWorkloadRole[];
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `serverId` | Required | Existing non-deleted deployment target/server whose complete role set will be replaced. |
| `workloadRoles` | Required; may be `[]` | Complete desired replacement set. Values are exactly `deployment-runtime`, `artifact-builder`, and `sandbox-worker`. |

The input must contain no duplicates and no unknown values. The command canonicalizes valid role
order as `deployment-runtime`, `artifact-builder`, then `sandbox-worker`, omitting roles not present.
It never infers roles from target kind, provider, Docker state, current workloads, execution
history, readiness, or capability evidence.

## Preconditions And Consistency Boundary

- The server must exist, be visible in the caller's tenant scope, and not be deleted.
- Active and inactive servers may retain or change role intent; roles never bypass lifecycle
  admission for later placement.
- The complete role set is one aggregate-owned value and is replaced atomically.
- The command owns only `DeploymentTarget.workloadRoles` plus the aggregate event for a real change.
- No Resource, Deployment, build attempt, Sandbox, Workspace, provider artifact, credential, proxy,
  route, log, or audit aggregate is part of this consistency boundary.

## Main Flow

1. Validate `serverId` and the complete `workloadRoles` input.
2. Normalize the valid set into canonical order.
3. Resolve the server through the write-side server repository.
4. Reject a missing, invisible, or deleted server.
5. Compare the normalized desired set with the current set as sets.
6. If equivalent, return idempotent success with `changed = false`; persist and publish nothing.
7. Otherwise replace only `DeploymentTarget.workloadRoles` and preserve every unrelated server fact.
8. Persist the server.
9. Publish or record `deployment_target.workload_roles_configured` after persistence.
10. Return the normalized persisted set with `changed = true`.

## Result

```ts
type ConfigureServerWorkloadRolesResult = Result<
  {
    workloadRoles: ServerWorkloadRole[];
    changed: boolean;
  },
  DomainError
>;
```

`workloadRoles` is always the normalized complete persisted set. `changed` means aggregate state
changed during this command; it does not mean workloads were moved or that any role's independent
technical capability became ready.

| Branch | Result | Persistence and event behavior |
| --- | --- | --- |
| Different valid set | `ok({ workloadRoles, changed: true })` | Persist exactly the new normalized set and publish/record the configured event once. |
| Equivalent valid set in any order | `ok({ workloadRoles, changed: false })` | No write and no duplicate event. |
| Empty desired set | `ok({ workloadRoles: [], changed })` | Server becomes general-purpose/unrestricted by role for future admission; existing bindings remain unchanged. |
| Invalid, missing, invisible, or deleted server | `err(DomainError)` | No role mutation, unrelated mutation, or event. |

## Prospective Semantics

Configuration affects only later new-placement decisions:

- a non-empty set admits a category by role only when its canonical role is present;
- `[]` admits every defined category by role;
- removing `deployment-runtime` blocks later new deployment placement but does not invalidate
  accepted, running, failed, succeeded, rollback, or historical Deployment target snapshots;
- removing `artifact-builder` or `sandbox-worker` does not cancel or rewrite existing build,
  Sandbox, Run, or Workspace bindings;
- later recovery or redeploy behavior follows the existing workload owner's durable lifecycle
  contract;
- drain, evacuation, rebalance, and migration require separate commands and are never hidden side
  effects of this command.

## Error Contract

| Error code | Phase | Retriable | Meaning | Recovery |
| --- | --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | `serverId` is invalid, a role is unknown, or a canonical role is duplicated. | Correct the complete input using only canonical distinct values, then retry. Use `[]` for unrestricted. |
| `not_found` | `server-admission` | No | Server is missing, invisible, or deleted. | Refresh authorized server state and choose an existing non-deleted server. |
| `infra_error` | `server-persistence` | Conditional | The changed role set could not be safely persisted. | Read `servers.show`; retry the same complete set only after confirming current state. |
| `infra_error` | `event-publication` | Conditional | The configured event could not be safely recorded after persistence. | Read `servers.show` and follow shared event-publication recovery; do not assume a second mutation is required. |

Validation and resolution failures must persist nothing. Error details must remain safe and may
include `phase`, `serverId`, the rejected role, and the supported canonical role list; they must not
include credentials, provider payloads, private policy, current workloads, or secret material.

## Idempotency, Retry, And Recovery

Set equality is the natural idempotency rule. Input order is not semantic. Submitting
`["artifact-builder", "deployment-runtime"]` after
`["deployment-runtime", "artifact-builder"]` returns the canonical set and `changed = false`.

After an uncertain transport or persistence outcome, call `servers.show`, compare the returned
normalized complete set, and retry the complete desired set only if needed. Never attempt recovery
with incremental assumptions.

Narrowing roles is prospective. If operators intend to relocate existing work, they must use a
separately governed workload lifecycle or future drain/evacuation operation; repeatedly calling this
command cannot perform that recovery.

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Server detail role editor submits the complete selected set and explains new-placement-only semantics. | Active |
| CLI | `appaloft server configure-workload-roles <serverId> [--workload-role <role> ...] [--json]`; no role flags submit `[]` as the complete unrestricted set. | Active |
| oRPC / HTTP | `POST /api/servers/{serverId}/workload-roles` using the shared command schema. | Active |
| Repository config | Not applicable. Repository config must not mutate durable Server Workload Roles. | Not applicable |
| Automation / MCP | Future command/tool over the exact operation key and shared schema. | Future |
| Public docs | Stable `server.workload-roles` topic and `server-workload-roles` help anchor. | Active |

Entrypoints may collect a multi-selection differently, but all dispatch the same complete-set
command. No entrypoint may infer roles, send aliases, bypass validation, or reinterpret `[]`.

## Events And Readback

A real change records `deployment_target.workload_roles_configured` with the normalized role set.
Equivalent reordered input records no duplicate event.

After successful persistence:

- `servers.list` and `servers.show` expose the same normalized `workloadRoles` set;
- public surfaces render `[]` explicitly as general-purpose/unrestricted;
- historical workload snapshots remain unchanged;
- `artifact-builder` remains intent only;
- Sandbox role admission/capability enforcement remains blocked until the neutral Server-aware
  placement contract exists.

## Tests

The governing matrix is
[Server Workload Role Test Matrix](../testing/server-workload-role-test-matrix.md), especially:

- `SRV-ROLE-003`: complete replacement, unrelated-state preservation, and one event on change;
- `SRV-ROLE-004`: duplicate/unknown rejection before mutation;
- `SRV-ROLE-005`: reordered-set idempotency with no write or duplicate event;
- `SRV-ROLE-008`: existing Deployment continuity after role removal;
- `SRV-ROLE-012`: canonical readback and explicit empty-set meaning;
- `SRV-ROLE-PERSIST-002`: no partial write on failure or no-op;
- `SRV-ROLE-ENTRY-001/002/003/004/005`: CLI, HTTP/oRPC, SDK, Web, catalog, and docs parity.

## Current Implementation Notes And Migration Gaps

The active application command accepts a complete role array, normalizes it through
`DeploymentTargetWorkloadRoles`, skips persistence/event publication when the normalized set is
unchanged, and returns `{ workloadRoles, changed }`. Registration and list/show use the same role
vocabulary and normalization.

Neutral remote artifact-builder execution is not implemented, so `artifact-builder` must not be
presented as readiness. Server-aware Sandbox placement remains blocked until the neutral candidate
or binding contract carries Server identity; provider-only evidence must not be used as a role
substitute.

## Open Questions

- None for complete-set Server Workload Role configuration.
