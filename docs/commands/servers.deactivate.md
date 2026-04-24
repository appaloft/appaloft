# servers.deactivate Command Spec

## Metadata

- Operation key: `servers.deactivate`
- Command class: `DeactivateServerCommand`
- Input schema: `DeactivateServerCommandInput`
- Handler: `DeactivateServerCommandHandler`
- Use case: `DeactivateServerUseCase`
- Domain / bounded context: Runtime topology / DeploymentTarget lifecycle
- Current status: active command
- Source classification: normative contract

## Normative Contract

`servers.deactivate` is the source-of-truth command for marking a deployment target/server inactive.

Command success means the server remains readable and historical relationships remain visible, but
the server is no longer eligible for new deployment admission, scheduling, terminal-target selection
for new operational workflows, or new proxy configuration targets.

```ts
type DeactivateServerResult = Result<{ id: string }, DomainError>;
```

The command contract is:

- admission failure returns `err(DomainError)`;
- accepted success returns `ok({ id })`;
- accepted success persists `DeploymentTarget.lifecycleStatus = "inactive"`;
- accepted success records `deactivatedAt` and optional safe reason;
- accepted success publishes or records `server-deactivated` only for the first active-to-inactive
  transition;
- repeated deactivation of an inactive server is idempotent and does not overwrite the original
  timestamp or reason.

## Global References

This command inherits:

- [ADR-004: Server Readiness State Storage](../decisions/ADR-004-server-readiness-state-storage.md)
- [ADR-026: Aggregate Mutation Command Boundary](../decisions/ADR-026-aggregate-mutation-command-boundary.md)
- [Deployment Target Lifecycle Workflow](../workflows/deployment-target-lifecycle.md)
- [Deployment Target Lifecycle Error Spec](../errors/servers.lifecycle.md)
- [Deployment Target Lifecycle Test Matrix](../testing/deployment-target-lifecycle-test-matrix.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Purpose

Deactivate a server when an operator no longer wants it used for new work, while preserving enough
state to understand current and historical usage.

It is not:

- a generic server update command;
- a connectivity test or repair command;
- a runtime stop command;
- a deployment cancel command;
- a domain, certificate, route, credential, terminal, log, or audit cleanup command;
- a destructive delete.

## Input Model

```ts
type DeactivateServerCommandInput = {
  serverId: string;
  reason?: string;
  idempotencyKey?: string;
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `serverId` | Required | Deployment target/server being deactivated. |
| `reason` | Optional | Short safe operator note for audit/read models. |
| `idempotencyKey` | Optional | Deduplicates retries for the same deactivate request where supported. |

`reason` must be safe to store and display:

- trim leading and trailing whitespace;
- reject empty text after trimming when the field is present;
- reject control characters and multiline values;
- reject values longer than 280 characters;
- reject obvious secret material such as private keys, access tokens, passwords, or raw credential
  values.

## Server Lifecycle State

The `DeploymentTarget` aggregate state must use value objects for lifecycle-significant fields:

- `DeploymentTargetLifecycleStatus` with at least `active` and `inactive`;
- `DeactivatedAt` for the transition timestamp;
- optional `DeactivationReason` for the normalized safe operator note.

Newly registered servers start as `active`.

Allowed transition:

```text
active -> inactive
```

Inactive servers remain readable through `servers.show`, `servers.list`, and delete-safety checks.
They may still appear in deployment history, domain/route history, logs, diagnostics, and audit.

## Admission Flow

The command must:

1. Validate command input.
2. Normalize optional `reason`.
3. Resolve `serverId` through a write-side repository path.
4. Reject missing or invisible server with `not_found`.
5. Treat already inactive servers as idempotent success.
6. Capture deactivation time through the injected clock.
7. Persist inactive lifecycle status, timestamp, and optional reason.
8. Publish or record `server-deactivated` when the state changes.
9. Return `ok({ id })`.

## Post-Deactivation Rules

After deactivation:

- `deployments.create` must reject the server during write-side admission;
- new scheduler/automation target selection must omit the server unless explicitly reading history;
- new proxy configuration or repair commands must reject the server unless a future recovery spec
  defines an explicit reactivation or repair exception;
- `servers.show` and `servers.delete-check` must continue to work so users can inspect blockers;
- existing deployments, domains, certificates, server-applied routes, credentials, logs,
  diagnostics, and audit state must not be removed or cascaded.

## Error Contract

All errors use [Deployment Target Lifecycle Error Spec](../errors/servers.lifecycle.md).

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | `serverId`, `reason`, or `idempotencyKey` shape is invalid. |
| `not_found` | `server-admission` | No | Server does not exist or is not visible. |
| `invariant_violation` | `server-lifecycle-guard` | No | DeploymentTarget rejected the lifecycle transition. |
| `infra_error` | `server-persistence` | Conditional | Inactive lifecycle state could not be safely persisted. |
| `infra_error` | `event-publication` | Conditional | `server-deactivated` could not be recorded before command success. |

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Server detail shows lifecycle status. Owner-scoped deactivate action UI waits for confirmation/undo affordances. | Partial / action gap |
| CLI | `appaloft server deactivate <serverId> [--reason ...] [--json]`. | Active |
| oRPC / HTTP | `POST /api/servers/{serverId}/deactivate` using the command schema. | Active |
| Repository config files | Not applicable. Repository config cannot deactivate deployment targets. | Not applicable |
| Automation / MCP | Future command/tool over the same operation key. | Future |
| Public docs | Existing `server.deployment-target` anchor covers deactivation and delete safety. | Active |

## Events

Canonical event spec:

- [server-deactivated](../events/server-deactivated.md): server lifecycle status changed to
  inactive.

## Current Implementation Notes And Migration Gaps

The first active slice exposes API/oRPC and CLI for deactivation, blocks `deployments.create`
from admitting inactive servers, and shows inactive status on Web server detail.

Web does not yet expose the deactivate action UI. That control needs explicit confirmation
affordances and must call this command when it is added. Reactivation remains future work.

## Open Questions

- None for one-way deactivate. Reactivation, runtime stop, and destructive delete remain separate
  future behaviors.
