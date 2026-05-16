# project-description-set Event Spec

## Purpose

`project-description-set` means a `Project` aggregate's description metadata changed or was
cleared through `projects.set-description`.

## Governing Sources

- [Project Lifecycle Workflow](../workflows/project-lifecycle.md)
- [projects.set-description Command Spec](../commands/projects.set-description.md)
- [Project Lifecycle Test Matrix](../testing/project-lifecycle-test-matrix.md)
- [ADR-026: Aggregate Mutation Command Boundary](../decisions/ADR-026-aggregate-mutation-command-boundary.md)

## Producer

Publisher: `projects.set-description` use case after durable persistence, using domain events
recorded by the `Project` aggregate.

## Payload

```ts
type ProjectDescriptionSetPayload = {
  projectId: string;
  projectSlug: string;
  changedAt: string;
  previousDescription?: string;
  nextDescription?: string;
};
```

Payloads must not include resource profile data, deployment snapshots, logs, runtime state, access
credentials, source locators, or secrets.

## Consumers

- Project read models and settings surfaces can refresh the safe description.
- Audit and support tooling can display that project metadata changed.

## Ordering And Idempotency

Consumers should key idempotency by `(projectId, changedAt, "project-description-set")`.

## Current Implementation Notes And Migration Gaps

The initial implementation emits the event from the explicit command only. No generic project update
event exists.
