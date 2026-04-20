# resources.archive Command Spec

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

## Admission Flow

The command must:

1. Validate command input.
2. Resolve `resourceId`.
3. Reject missing or invisible resource with `not_found`.
4. Treat an already archived resource as idempotent success.
5. Reject deletion-only or corrupted lifecycle states with `invariant_violation`.
6. Persist archived lifecycle status and optional safe reason.
7. Publish or record `resource-archived` when the state changes.
8. Return `ok({ id })`.

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

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Resource detail destructive/lifecycle action dispatches this command after confirmation. | Required in Code Round |
| CLI | `appaloft resource archive <resourceId> [--reason ...]`. | Required in Code Round |
| oRPC / HTTP | `POST /api/resources/{resourceId}/archive` using the command schema. | Required in Code Round |
| Automation / MCP | Future command/tool over the same operation key. | Future |

## Events

Canonical event spec:

- [resource-archived](../events/resource-archived.md): resource lifecycle status changed to
  archived.

## Current Implementation Notes And Migration Gaps

Resource archived lifecycle state is not active until this command appears in `CORE_OPERATIONS.md`,
`operation-catalog.ts`, application slices, transports, read models, and tests.

## Open Questions

- None for archive semantics. Runtime stop/cleanup remains a separate future behavior.
