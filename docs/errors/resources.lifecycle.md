# Resource Lifecycle Error Spec

## Normative Contract

Resource lifecycle commands use the shared platform error model and neverthrow conventions. This file defines the resource-specific error profile for `resources.create` and the minimum resource lifecycle.

Resource errors must use stable `code`, `category`, `phase`, `retriable`, and related entity details. They must not rely on message text as the contract.

## Global References

This spec inherits:

- [ADR-011: Resource Create Minimum Lifecycle](../decisions/ADR-011-resource-create-minimum-lifecycle.md)
- [Error Model](./model.md)
- [neverthrow Conventions](./neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Error Details

```ts
type ResourceLifecycleErrorDetails = {
  commandName?: "resources.create";
  eventName?: "resource-created";
  phase:
    | "command-validation"
    | "context-resolution"
    | "resource-admission"
    | "resource-persistence"
    | "event-publication"
    | "event-consumption";
  step?: string;
  projectId?: string;
  environmentId?: string;
  destinationId?: string;
  resourceId?: string;
  resourceSlug?: string;
  resourceKind?: string;
  relatedEntityId?: string;
  relatedEntityType?: "project" | "environment" | "destination" | "resource";
  relatedState?: string;
  correlationId?: string;
  causationId?: string;
};
```

Error details must not include secrets, source credentials, deployment logs, environment secret values, or provider credentials.

## Admission Errors

Admission errors reject `resources.create` and return `err(DomainError)`.

| Error code | Category | Phase | Retriable | Meaning |
| --- | --- | --- | --- | --- |
| `validation_error` | `validation` | `command-validation` | No | Input shape, resource name, resource kind, service name, service kind, or description is invalid. |
| `not_found` | `not-found` | `context-resolution` | No | Project, environment, or destination cannot be found or is not visible. |
| `resource_context_mismatch` | `application` | `context-resolution` | No | Environment or destination does not match the supplied project/environment context. |
| `resource_slug_conflict` | `conflict` | `resource-admission` | No | A resource with the same slug already exists in the same project/environment. |
| `invariant_violation` | `domain` | `resource-admission` | No | Resource aggregate rule rejected the requested state. |
| `infra_error` | `infra` | `resource-persistence` | Conditional | Persistence failed before the resource could be safely created. |
| `infra_error` | `infra` | `event-publication` | Conditional | Event publication or outbox recording failed before command success could be safely returned. |

## Async Error Profile

`resources.create` is a synchronous creation command. It does not start long-running resource provisioning in the minimum lifecycle.

Event consumer failures after `resource-created` is recorded are projection/event-processing failures. They must not reinterpret the original command result.

| Error condition | Required representation | Retriable |
| --- | --- | --- |
| Read-model projection fails after `resource-created` | Event consumer monitoring records `phase = event-consumption`; resource remains created. | Yes when projection can be retried. |
| Duplicate event consumed | Consumer returns `ok` or no-op; resource read model is not duplicated. | Not applicable |
| Event publication cannot be recorded before command success | `resources.create` returns `err` with `code = infra_error`, `phase = event-publication`. | Conditional |

## Consumer Mapping

Web, CLI, HTTP API, workers, and tests must use [Error Model](./model.md).

Resource consumers additionally must:

- show duplicate resource-name failures as slug conflicts;
- distinguish missing project/environment/destination from context mismatch;
- avoid retry affordances for validation, not-found, conflict, and invariant errors;
- expose `resourceId`, `projectId`, `environmentId`, and `resourceSlug` in structured debug/test contexts when available.

## Test Assertions

Tests must assert:

- `Result` shape;
- `error.code`;
- `error.category`;
- `error.retriable`;
- `phase`;
- related entity ids and resource slug when relevant;
- no resource persisted on admission failure;
- no duplicate `resource-created` effect on duplicate event consumption.

## Current Implementation Notes And Migration Gaps

Current core/resource value objects and aggregate operations already return `Result` for validation and invariant failures.

Current resource creation can happen inside deployment bootstrap, where errors are currently surfaced through deployment admission phases rather than `resources.create` phases.

`resources.create` command-level error mapping is implemented for validation, not found, context mismatch, slug conflict, invariant, and infra failures. Transport and UI tests for those mappings are still pending.

## Open Questions

- None for the minimum lifecycle.
