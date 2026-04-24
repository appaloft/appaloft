# Project Lifecycle Error Spec

## Normative Contract

Project lifecycle commands and queries use the shared platform error model and neverthrow
conventions. This file defines the project-specific error profile for `projects.show`,
`projects.rename`, `projects.archive`, and project-context guards used by child operations.

Errors must use stable `code`, `category`, `phase`, `retriable`, and related entity details. They
must not rely on message text as the contract.

## Global References

- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-026: Aggregate Mutation Command Boundary](../decisions/ADR-026-aggregate-mutation-command-boundary.md)
- [Project Lifecycle Workflow](../workflows/project-lifecycle.md)
- [Error Model](./model.md)
- [neverthrow Conventions](./neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Error Details

```ts
type ProjectLifecycleErrorDetails = {
  commandName?:
    | "projects.rename"
    | "projects.archive"
    | "environments.create"
    | "resources.create"
    | "deployments.create";
  queryName?: "projects.show";
  eventName?: "project-renamed" | "project-archived";
  phase:
    | "command-validation"
    | "query-validation"
    | "context-resolution"
    | "project-read"
    | "project-admission"
    | "project-lifecycle-guard"
    | "project-persistence"
    | "event-publication"
    | "event-consumption";
  projectId?: string;
  projectSlug?: string;
  lifecycleStatus?: "active" | "archived";
  archivedAt?: string;
  archiveReason?: string;
  relatedEntityId?: string;
  relatedEntityType?: "project";
};
```

Error details must not include secrets, provider credentials, deployment logs, or raw source
metadata.

## Query Errors

| Error code | Category | Phase | Retriable | Meaning |
| --- | --- | --- | --- | --- |
| `validation_error` | `validation` | `query-validation` | No | `projects.show` input is invalid. |
| `not_found` | `not-found` | `project-read` | No | Project cannot be found or is not visible. |
| `infra_error` | `infra` | `project-read` | Conditional | Project read model cannot be safely read. |

## Command Errors

| Error code | Category | Phase | Retriable | Meaning |
| --- | --- | --- | --- | --- |
| `validation_error` | `validation` | `command-validation` | No | Command input shape, project name, or archive reason is invalid. |
| `not_found` | `not-found` | `context-resolution` | No | Project cannot be found or is not visible. |
| `project_slug_conflict` | `conflict` | `project-admission` | No | Derived project slug is already owned by another project. |
| `project_archived` | `conflict` | `project-lifecycle-guard` | No | Mutation or deployment admission targeted an archived project. |
| `invariant_violation` | `domain` | `project-lifecycle-guard` | No | Project aggregate lifecycle transition rejected the requested change. |
| `infra_error` | `infra` | `project-persistence` | Conditional | Project state could not be safely persisted. |
| `infra_error` | `infra` | `event-publication` | Conditional | Project event publication or outbox recording failed before command success could be returned. |

## Async Error Profile

Project show, rename, and archive are synchronous workspace-state operations. They do not start
long-running platform work.

Projection or audit consumer failures after project events are recorded must be represented as
event-consumer failures. They must not reinterpret the original command result.

## Consumer Mapping

Web, CLI, HTTP API, workers, and tests must use [Error Model](./model.md).

Project consumers additionally must:

- distinguish missing projects from archived-project guards;
- show slug conflicts as conflicts, not validation failures;
- avoid retry affordances for validation, not-found, conflict, and invariant errors;
- keep project-level deployment actions routed through resource selection or Quick Deploy.

## Test Assertions

Tests must assert:

- `Result` shape;
- `error.code`;
- `error.category`;
- `error.retriable`;
- phase in `details.phase`;
- `projectId`, `projectSlug`, `lifecycleStatus`, or `archivedAt` when relevant;
- no duplicate event when rename/archive is idempotent.

## Current Implementation Notes And Migration Gaps

Project hard delete is not part of this spec. Description editing is deferred until a named command
is specified.

## Open Questions

- None for show, rename, and archive.
