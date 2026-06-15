# resources.restore Command Spec

## Metadata

- Operation key: `resources.restore`
- Command class: `RestoreResourceCommand`
- Input schema: `RestoreResourceCommandInput`
- Handler: `RestoreResourceCommandHandler`
- Use case: `RestoreResourceUseCase`
- Domain / bounded context: Workload Delivery / Resource lifecycle
- Current status: active command
- Source classification: normative contract for restore implementation

## Normative Contract

`resources.restore` is the source-of-truth command for reopening an archived Resource for future
profile mutations and deployment admission.

Command success means the resource lifecycle status is durably `active`.

```ts
type RestoreResourceResult = Result<{ id: string }, DomainError>;
```

The command contract is:

- admission failure returns `err(DomainError)`;
- accepted success returns `ok({ id })`;
- accepted success persists the `Resource` aggregate with active lifecycle status;
- accepted success clears `archivedAt` and `archiveReason`;
- accepted success publishes or records `resource-restored`;
- already active resources are idempotent and do not publish duplicate events;
- deleted resources cannot be restored through this command.

## Purpose

Restore a previously archived resource without rewriting historical deployments, runtime logs,
routes, domain bindings, dependency bindings, or audit records.

It is not:

- a deployment command;
- a runtime start command;
- a rollback command;
- a route, domain, dependency, or storage mutation command;
- a way to recover deleted resource tombstones.

## Input Model

```ts
type RestoreResourceCommandInput = {
  resourceId: string;
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `resourceId` | Required | Resource being restored. |

## Resource Lifecycle State

An archived resource can transition back to `active`. The transition preserves resource identity,
slug, project/environment ownership, source profile, runtime profile, network profile, health
policy, service declarations, deployment history, access summaries, diagnostics, logs, and audit
context.

Already active resources are idempotent for this command: the command returns `ok({ id })`, does
not mutate state, and does not publish `resource-restored`.

Deleted resources are not restorable through this command.

## Admission Flow

The command must:

1. Validate command input.
2. Resolve `resourceId`.
3. Reject missing or invisible resource with `not_found`.
4. Treat an already active resource as idempotent success.
5. Reject deleted lifecycle states through the lifecycle state-machine invariant.
6. Capture restore time through the injected clock.
7. Persist active lifecycle status and clear archive metadata.
8. Publish or record `resource-restored` when the state changes.

## Global References

This command inherits:

- [ADR-011: Resource Create Minimum Lifecycle](../decisions/ADR-011-resource-create-minimum-lifecycle.md)
- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [resources.show Query Spec](../queries/resources.show.md)
- [resource-restored Event Spec](../events/resource-restored.md)
- [Resource Profile Lifecycle Workflow](../workflows/resource-profile-lifecycle.md)
- [Resource Lifecycle Error Spec](../errors/resources.lifecycle.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
