# Error Model

## Normative Contract

Errors are part of the platform contract. Expected business, validation, application, integration, infrastructure, and async-processing failures must be represented as structured errors with stable codes and machine-readable details.

Human-facing messages are not the contract. Tests, adapters, UI, CLI, workers, and event consumers must depend on `code`, `category`, `phase`, `retriable`, and relevant detail fields.

## Error Structure

All expected errors must use this logical shape:

```ts
type ErrorCategory =
  | "validation"
  | "domain"
  | "application"
  | "infra"
  | "integration"
  | "async-processing"
  | "conflict"
  | "permission"
  | "not-found"
  | "timeout";

type ErrorDetails = {
  commandName?: string;
  eventName?: string;
  phase?: string;
  step?: string;
  relatedEntityId?: string;
  relatedEntityType?: string;
  relatedState?: string;
  attemptId?: string;
  correlationId?: string;
  causationId?: string;
  retryAfter?: string;
  [key: string]: string | number | boolean | null | undefined;
};

type PlatformError = {
  code: string;
  category: ErrorCategory;
  phase: string;
  message: string;
  details: ErrorDetails;
  retriable: boolean;
  retryAfter?: string;
  relatedEntityId?: string;
  relatedState?: string;
  correlationId?: string;
  causationId?: string;
};
```

The implementation may carry some fields inside `details` while the richer shape is introduced. The contract still requires every spec to define the logical fields.

Secrets, private keys, access tokens, raw environment secret values, and command output that may contain secrets must not be stored in error details.

## Error Categories

| Category | Meaning | Retriable default | Typical HTTP mapping |
| --- | --- | --- | --- |
| `validation` | Input shape or field constraint failed before admission. | No | 400 |
| `domain` | Aggregate invariant or state-machine rule rejected the operation. | No | 400 |
| `application` | Use-case admission or orchestration rule failed outside a single aggregate. | No | 400 or 409 |
| `infra` | Persistence, filesystem, local runtime, process, or infrastructure boundary failed. | Conditional | 500 or 503 |
| `integration` | External provider, runtime provider, VCS, or third-party system failed. | Conditional | 502 or 503 |
| `async-processing` | Accepted command or event follow-up failed in background processing. | Conditional | Exposed through status/read model, not the original admission response |
| `conflict` | The request conflicts with existing state. | No | 409 |
| `permission` | Actor is not allowed to perform the operation. | No | 403 |
| `not-found` | Referenced entity does not exist or is not visible to the actor. | No | 404 |
| `timeout` | A bounded wait timed out. | Usually yes | 504 or async failed/retrying status |

`retriable` overrides the default. Consumers must respect the explicit `retriable` field.

## Stable Codes

Codes must be stable identifiers, not localized text. Examples:

| Code | Category | Required phase/details |
| --- | --- | --- |
| `validation_error` | `validation` | field/path when available |
| `invariant_violation` | `domain` | current state and attempted transition |
| `not_found` | `not-found` | entity type and id |
| `conflict` | `conflict` | conflict subject and state |
| `deployment_not_redeployable` | `domain` or `application` | deployment id, resource id, current status |
| `provider_error` | `integration` | provider key and operation |
| `runtime_target_unsupported` | `application` or `integration` | target kind, provider key, missing capability, selected target/destination context |
| `unsupported_config_field` | `validation` or `application` | config path, field path, requested capability, selected entry/workflow context |
| `resource_profile_drift` | `application` or `conflict` | resource id, changed profile section, required update operation when known |
| `infra_error` | `infra` | adapter and operation |
| `retryable_error` | category by source plus `retriable = true` | retry owner and retry hint when available |
| `edge_proxy_provider_unsupported` | `integration` | server id, provider key, proxy kind |
| `edge_proxy_network_failed` | `async-processing` or `infra` | server id, proxy kind, attempt id |
| `edge_proxy_start_failed` | `async-processing` or `infra` | server id, proxy kind, attempt id |
| `edge_proxy_host_port_conflict` | `async-processing` or `infra` | phase `proxy-container`, provider key, proxy kind, host port when parseable, container name, network name |

When introducing a new code, the command/event/workflow spec that owns the branch must define its category, phase, retriable behavior, and consumer mapping.

## Phase And Step

Every command, event, or workflow spec must name its phases. Phases identify where the failure occurred and are part of the test contract.

Examples from existing specs:

- `command-validation`
- `config-bootstrap`
- `context-resolution`
- `redeploy-guard`
- `source-detection`
- `runtime-plan-resolution`
- `runtime-execution`
- `register`
- `credential-resolution`
- `connect`
- `proxy-bootstrap`
- `proxy-network`
- `proxy-container`
- `server-ready`
- `event-publication`
- `event-consumption`

`step` is optional and should be used for finer-grained worker steps such as `docker-network-create`, `ssh-connect`, or `health-check`.

## Synchronous And Async Error Semantics

Synchronous admission errors mean the command request was not accepted. They return `err(PlatformError)` through the command result.

Post-acceptance async errors mean the command request or event was accepted, but follow-up work failed. They must be represented through durable state, terminal or retry events, read models, and worker/event monitoring.

Rules:

- command admission failure returns `err`;
- accepted command returns `ok(...)`;
- post-acceptance failure must not rewrite the original command result into `err`;
- terminal async failure must persist terminal state and publish a failure event;
- retriable async failure must persist retry state and retry ownership;
- retry must create a new attempt id rather than replaying an old fact event as the retry mechanism.

## Consumer Mapping

### Web UI

Web UI must:

- map `code` and `phase` to i18n keys;
- display read-model status for post-acceptance failures;
- show retry affordances only when `retriable = true` and a retry command exists;
- avoid branching on raw `message`.

### CLI

CLI must:

- return stable error code/category/phase in structured output modes;
- show human text for interactive users;
- distinguish command rejection from accepted async failure in status/watch commands;
- avoid treating translated text as a machine contract.

### HTTP API

HTTP adapters must map errors predictably:

| Category | HTTP status |
| --- | --- |
| `validation` | 400 |
| `domain` | 400 unless a more specific conflict applies |
| `application` | 400 or 409 |
| `conflict` | 409 |
| `permission` | 403 |
| `not-found` | 404 |
| `infra` | 500 or 503 when retriable |
| `integration` | 502 or 503 when retriable |
| `timeout` | 504 or 503 when async retry is scheduled |
| `async-processing` | Expose through status/read-model endpoints; do not remap the original accepted command response |

### Background Worker / Job Logs

Workers must log:

- `code`;
- `category`;
- `phase`;
- `step`;
- `attemptId`;
- `relatedEntityId`;
- `relatedState`;
- `retriable`;
- `retryAfter`;
- `correlationId`;
- `causationId`.

Workers must persist terminal or retryable process state before emitting terminal success/failure events.

### Event Consumer Monitoring

Event consumers must separate:

- event occurred;
- event handler started;
- event handler succeeded;
- event handler failed retriably;
- event handler failed permanently.

Consumer failure is not automatically domain failure. It becomes domain/process failure only when the workflow spec says that state transition was attempted and persisted.

## Test Contract

Tests must assert:

- `result.isErr()` or `result.isOk()`;
- `error.code`;
- `error.category`;
- `error.retriable`;
- `error.details.phase` or logical `phase`;
- related entity id/state where relevant;
- retry attempt id where relevant;
- terminal state and failure event for async failures.

Tests must not assert only:

- thrown exception text;
- localized message text;
- generic non-zero exit code;
- log text without structured code/phase.

## Current Implementation Notes And Migration Gaps

The current core error shape uses `code`, broad `category` values (`user`, `infra`, `provider`, `retryable`), `message`, `retryable`, and optional `details`.

The global logical categories in this document are richer than the current runtime category union. Until the runtime type is expanded, adapters and specs can map existing categories into the richer logical categories through `code` and `details.phase`.

Phase, attempt id, correlation id, causation id, related entity id, and related state are not yet uniformly populated across all command/event paths.

Some existing docs and code use `retryable`, while this document standardizes the logical field name as `retriable`. During migration, both spellings may appear at boundaries, but specs should use `retriable`.

## Open Questions

- Should the core `DomainError.category` union be expanded to match the richer logical categories directly?
- Should `phase` move from `details.phase` to a required top-level error field?
- Should `retryAfter`, `relatedEntityId`, `relatedState`, `correlationId`, and `causationId` be top-level fields or stay in `details` until stabilized?
- Should HTTP responses expose full structured details by default or only in debug/admin contexts?
