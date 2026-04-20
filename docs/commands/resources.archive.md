# resources.archive Command Spec

## Metadata

- Operation key: `resources.archive`
- Command class: `ArchiveResourceCommand`
- Input schema: `ArchiveResourceCommandInput`
- Handler: `ArchiveResourceCommandHandler`
- Use case: `ArchiveResourceUseCase`
- Domain / bounded context: Workload Delivery / Resource lifecycle
- Current status: active command
- Source classification: normative contract for archive implementation

## Normative Contract

`resources.archive` is the source-of-truth command for marking a resource unavailable for new
profile mutations and deployments while retaining its history and observable support context.

Command success means the resource lifecycle status is durably `archived`.

```ts
type ArchiveResourceResult = Result<{ id: string }, DomainError>;
```

The command contract is:

- admission failure returns `err(DomainError)`;
- accepted success returns `ok({ id })`;
- accepted success persists the `Resource` aggregate with archived lifecycle status;
- accepted success publishes or records `resource-archived`;
- archived resources remain readable through resource read queries where retained;
- archived resources cannot receive new deployments or profile mutation commands.

## Global References

This command inherits:

- [ADR-011: Resource Create Minimum Lifecycle](../decisions/ADR-011-resource-create-minimum-lifecycle.md)
- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [resources.show Query Spec](../queries/resources.show.md)
- [resource-archived Event Spec](../events/resource-archived.md)
- [Resource Profile Lifecycle Workflow](../workflows/resource-profile-lifecycle.md)
- [Resource Lifecycle Error Spec](../errors/resources.lifecycle.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Purpose

Retire a resource from future operations without destroying history, logs, diagnostics, access
summaries, or deployment records.

It is not:

- a generic resource update command;
- a runtime stop command;
- a deployment cancel command;
- a rollback or redeploy command;
- a domain binding deletion command;
- a destructive data cleanup command.

## Input Model

```ts
type ArchiveResourceCommandInput = {
  resourceId: string;
  reason?: string;
  idempotencyKey?: string;
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `resourceId` | Required | Resource being archived. |
| `reason` | Optional | Short safe operator note for audit/read models. |
| `idempotencyKey` | Optional | Deduplicates retries for the same archive request. |

`reason` is not a free-form log field. It must be normalized through an archive reason value
object before persistence or event publication:

- trim leading and trailing whitespace;
- reject empty text after trimming when the field is present;
- reject control characters and multiline values;
- reject values longer than 280 characters;
- reject obvious secret material such as private keys, access tokens, passwords, or raw
  credential-like values.

## Resource Lifecycle State

Archive introduces explicit Resource lifecycle state.

The `Resource` aggregate state must use value objects for lifecycle-significant fields rather than
raw strings:

- `ResourceLifecycleStatus` with at least `active` and `archived`;
- `ArchivedAt` for the archive transition timestamp;
- optional `ArchiveReason` for the normalized safe operator note.

New resources start as `active`. An active resource can transition to `archived` exactly once.
Archiving preserves the resource identity, slug, project/environment ownership, source profile,
runtime profile, network profile, health policy, service declarations, deployment history, access
summaries, diagnostics, logs, and audit context.

Already archived resources are idempotent for this command: the command returns `ok({ id })`,
does not change `archivedAt` or `reason`, and does not publish a duplicate `resource-archived`
event.

## Admission Flow

The command must:

1. Validate command input.
2. Normalize optional `reason` through `ArchiveReason`.
3. Resolve `resourceId`.
4. Reject missing or invisible resource with `not_found`.
5. Treat an already archived resource as idempotent success.
6. Reject deletion-only or corrupted lifecycle states with `invariant_violation`.
7. Capture archive time through the injected clock.
8. Persist archived lifecycle status, archive timestamp, and optional safe reason.
9. Publish or record `resource-archived` when the state changes.
10. Return `ok({ id })`.

## Resource-Specific Rules

Archiving is a management lifecycle change. It does not stop current runtime, delete containers,
remove proxy routes, unbind domains, revoke certificates, delete source links, delete deployment
history, or clear logs.

After archive:

- `resources.show`, `resources.health`, `resources.runtime-logs`, `resources.diagnostic-summary`,
  and related read queries may still return retained context;
- `deployments.create` must reject the resource;
- `resources.configure-source`, `resources.configure-runtime`, `resources.configure-network`, and
  `resources.configure-health` must reject the resource;
- domain/TLS and access cleanup require their own explicit commands;
- hard deletion requires `resources.delete` and deletion guards.

If a future runtime stop command exists, archive workflows may recommend running it first, but
`resources.archive` must not hide that runtime side effect.

## Error Contract

All errors use [Resource Lifecycle Error Spec](../errors/resources.lifecycle.md).

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | `resourceId`, `reason`, or `idempotencyKey` shape is invalid. |
| `not_found` | `context-resolution` or `resource-read` | No | Resource does not exist or is not visible. |
| `invariant_violation` | `resource-lifecycle-guard` | No | Resource lifecycle state cannot transition to archived. |
| `infra_error` | `resource-persistence` | Conditional | Archive state could not be safely persisted. |
| `infra_error` | `event-publication` | Conditional | `resource-archived` could not be recorded before command success. |

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Resource detail destructive/lifecycle action dispatches this command after confirmation. | Active |
| CLI | `appaloft resource archive <resourceId> [--reason ...]`. | Active |
| oRPC / HTTP | `POST /api/resources/{resourceId}/archive` using the command schema. | Active |
| Automation / MCP | Future command/tool over the same operation key. | Future |

## Events

Canonical event spec:

- [resource-archived](../events/resource-archived.md): resource lifecycle status changed to
  archived.

## Current Implementation Notes And Migration Gaps

Resource archived lifecycle state is active in `CORE_OPERATIONS.md`, `operation-catalog.ts`,
application slices, persistence, transports, `resources.show`, CLI, Web, and focused tests.

Archived-resource guards are active for `deployments.create`, `resources.configure-source`,
`resources.configure-runtime`, `resources.configure-network`, and `resources.configure-health`.

## Open Questions

- None for archive semantics. Runtime stop/cleanup remains a separate future behavior.
