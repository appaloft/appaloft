# Environment Lifecycle Error Spec

## Normative Contract

Environment lifecycle commands and queries use the shared platform error model and neverthrow
conventions. This file defines the environment-specific error profile for environment reads,
configuration writes, promotion, archive, and environment-context guards used by resource/deployment
admission.

Errors must use stable `code`, `category`, `phase`, `retriable`, and related entity details. They
must not rely on message text as the contract.

## Global References

- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-026: Aggregate Mutation Command Boundary](../decisions/ADR-026-aggregate-mutation-command-boundary.md)
- [Environment Lifecycle Workflow](../workflows/environment-lifecycle.md)
- [Error Model](./model.md)
- [neverthrow Conventions](./neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Error Details

```ts
type EnvironmentLifecycleErrorDetails = {
  commandName?:
    | "environments.set-variable"
    | "environments.unset-variable"
    | "environments.promote"
    | "environments.lock"
    | "environments.unlock"
    | "environments.archive"
    | "resources.create"
    | "deployments.create";
  queryName?:
    | "environments.show"
    | "environments.list"
    | "environments.effective-precedence"
    | "environments.diff";
  eventName?: "environment-locked" | "environment-unlocked" | "environment-archived";
  phase:
    | "command-validation"
    | "query-validation"
    | "context-resolution"
    | "environment-read"
    | "environment-admission"
    | "environment-lifecycle-guard"
    | "config-read"
    | "config-identity"
    | "config-secret-validation"
    | "config-profile-resolution"
    | "environment-persistence"
    | "event-publication"
    | "event-consumption";
  projectId?: string;
  environmentId?: string;
  environmentName?: string;
  environmentKind?: string;
  lifecycleStatus?: "active" | "locked" | "archived";
  lockedAt?: string;
  lockReason?: string;
  archivedAt?: string;
  archiveReason?: string;
  variableKey?: string;
  variableExposure?: "build-time" | "runtime";
  variableScope?:
    | "defaults"
    | "system"
    | "organization"
    | "project"
    | "environment"
    | "resource"
    | "deployment";
  variableKind?: "plain-config" | "secret" | "provider-specific" | "deployment-strategy";
  relatedEntityId?: string;
  relatedEntityType?: "project" | "environment" | "resource" | "deployment";
};
```

Error details must not include secrets, provider credentials, deployment logs, raw source metadata,
or plaintext environment values.

## Query Errors

| Error code | Category | Phase | Retriable | Meaning |
| --- | --- | --- | --- | --- |
| `validation_error` | `validation` | `query-validation` | No | Environment query input is invalid. |
| `not_found` | `not-found` | `environment-read` | No | Environment cannot be found or is not visible. |
| `infra_error` | `infra` | `environment-read` | Conditional | Environment read model cannot be safely read. |

## Command And Guard Errors

| Error code | Category | Phase | Retriable | Meaning |
| --- | --- | --- | --- | --- |
| `validation_error` | `validation` | `command-validation` | No | Command input shape, variable identity, or archive reason is invalid. |
| `not_found` | `not-found` | `context-resolution` | No | Environment cannot be found or is not visible. |
| `environment_locked` | `conflict` | `environment-lifecycle-guard` | No | Mutation, resource creation, or deployment admission targeted a locked environment. |
| `environment_archived` | `conflict` | `environment-lifecycle-guard` | No | Mutation, resource creation, or deployment admission targeted an archived environment. |
| `invariant_violation` | `domain` | `environment-lifecycle-guard` | No | Environment aggregate lifecycle transition rejected the requested change. |
| `validation_error` | `validation` | `config-identity`, `config-secret-validation`, `config-profile-resolution` | No | Environment variable shape, exposure, scope, or secret policy is invalid. |
| `not_found` | `not-found` | `config-read` | No | Requested environment variable identity cannot be found for removal. |
| `infra_error` | `infra` | `environment-persistence` | Conditional | Environment state could not be safely persisted. |
| `infra_error` | `infra` | `event-publication` | Conditional | Environment event publication or outbox recording failed before command success could be returned. |

## Async Error Profile

Environment configuration and archive commands are synchronous workspace-state operations. They do
not start long-running platform work.

Projection or audit consumer failures after environment events are recorded must be represented as
event-consumer failures. They must not reinterpret the original command result.

## Consumer Mapping

Web, CLI, HTTP API, workers, and tests must use [Error Model](./model.md).

Environment consumers additionally must:

- distinguish missing environments from archived-environment guards;
- distinguish locked-environment guards from archived-environment guards;
- avoid retry affordances for validation, not-found, conflict, and invariant errors;
- keep resource/deployment cleanup routed through explicit resource or deployment operations.

## Test Assertions

Tests must assert:

- `Result` shape;
- `error.code`;
- `error.category`;
- `error.retriable`;
- phase in `details.phase`;
- `environmentId`, `projectId`, `environmentName`, `lifecycleStatus`, `lockedAt`, or `archivedAt`
  when relevant;
- no duplicate event when archive is idempotent;
- no duplicate event when lock/unlock are idempotent;
- no plaintext secret values in errors, events, read models, or logs.

## Current Implementation Notes And Migration Gaps

No migration gaps are recorded for this lifecycle slice.

## Open Questions

- None for lock/unlock/archive.
