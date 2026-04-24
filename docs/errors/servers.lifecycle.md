# Deployment Target Lifecycle Error Spec

## Normative Contract

Deployment target lifecycle queries and commands use the shared platform error
model and neverthrow conventions. This file defines the server-lifecycle error profile for
`servers.show`, `servers.delete-check`, and explicit server lifecycle mutations.

Errors must use stable `code`, `category`, `phase`, `retriable`, and related entity details. They
must not rely on message text as the contract.

## Global References

- [ADR-004: Server Readiness State Storage](../decisions/ADR-004-server-readiness-state-storage.md)
- [ADR-019: Edge Proxy Provider And Observable Configuration](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)
- [ADR-026: Aggregate Mutation Command Boundary](../decisions/ADR-026-aggregate-mutation-command-boundary.md)
- [Deployment Target Lifecycle Workflow](../workflows/deployment-target-lifecycle.md)
- [Error Model](./model.md)
- [neverthrow Conventions](./neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Error Details

```ts
type ServerLifecycleErrorDetails = {
  queryName?: "servers.show" | "servers.delete-check";
  commandName?:
    | "servers.rename"
    | "servers.configure-edge-proxy"
    | "servers.deactivate"
    | "servers.delete";
  phase:
    | "query-validation"
    | "command-validation"
    | "server-read"
    | "server-rollup-read"
    | "server-delete-check-read"
    | "server-admission"
    | "server-lifecycle-guard"
    | "server-persistence"
    | "event-publication"
    | "event-consumption";
  serverId?: string;
  relatedEntityId?: string;
  relatedEntityType?:
    | "server"
    | "deployment"
    | "resource"
    | "domain-binding"
    | "certificate"
    | "credential"
    | "server-applied-route"
    | "default-access-policy"
    | "terminal-session"
    | "runtime-task"
    | "runtime-log"
    | "audit-log";
  relatedState?: string;
  deletionBlockers?: string[];
};
```

Error details must not include private keys, SSH command output, Docker logs, environment secrets,
certificate material, or provider account secrets.

## Query Errors

| Error code | Category | Phase | Retriable | Meaning |
| --- | --- | --- | --- | --- |
| `validation_error` | `validation` | `query-validation` | No | `servers.show` input is invalid. |
| `not_found` | `not-found` | `server-read` | No | Server cannot be found or is not visible. |
| `infra_error` | `infra` | `server-read` | Conditional | Base server read model cannot be safely read. |
| `infra_error` | `infra` | `server-rollup-read` | Conditional | Deployment/resource/domain rollups cannot be safely derived. |
| `infra_error` | `infra` | `server-delete-check-read` | Conditional | Delete safety blocker checks cannot be safely derived. |

`servers.delete-check` returns blockers inside `ok({ eligible: false, blockers })`. Blocked
eligibility is not itself a query error.

## Command Errors

Server lifecycle commands use these branches:

| Error code | Category | Phase | Retriable | Meaning |
| --- | --- | --- | --- | --- |
| `validation_error` | `validation` | `command-validation` | No | Command input is missing or malformed. |
| `not_found` | `not-found` | `server-admission` | No | Server cannot be found or is not visible. |
| `server_delete_blocked` | `conflict` | `server-lifecycle-guard` | No | Delete or final removal is blocked by retained deployments, resources, domains, routes, terminal sessions, logs, audit, or support diagnostics. |
| `invariant_violation` | `domain` | `server-lifecycle-guard` | No | DeploymentTarget rejected the requested lifecycle transition. |
| `infra_error` | `infra` | `server-persistence` | Conditional | Server state could not be safely persisted. |
| `infra_error` | `infra` | `event-publication` | Conditional | A lifecycle event could not be recorded before command success. |

`servers.rename` does not block on retained dependencies and does not enforce a unique display
name. The server id remains the durable reference. Deleted server tombstones are immutable through
ordinary rename and return `not_found` at `phase = server-admission` when resolved by the write-side
repository.

`servers.deactivate` does not block on retained dependencies. It is designed to preserve visibility
while preventing future use. Active deployments and retained dependencies appear in
`servers.delete-check` blockers and `servers.delete` guards.

`servers.delete` must convert the same blocker semantics as `servers.delete-check` into
`server_delete_blocked`. Active servers are blocked with `deletionBlockers = ["active-server"]`.
Inactive servers with retained deployments, resources, domains, certificates, credentials, source
links, server-applied routes, default-access policy overrides, terminal sessions, runtime tasks,
runtime-log retention, or audit retention are blocked with the corresponding safe blocker kinds.
Confirmation mismatch is a validation error at `phase = server-lifecycle-guard`.

## Async Error Profile

`servers.show` is synchronous read behavior and starts no async work.

Future lifecycle commands that start proxy, connectivity, or cleanup work must inherit the async
acceptance rules from [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
and the server/proxy-specific rules in [Server Bootstrap Error Spec](./server-bootstrap.md).

## Consumer Mapping

Web, CLI, HTTP API, workers, and tests must use [Error Model](./model.md).

Server lifecycle consumers additionally must:

- distinguish missing servers from blocker conflicts;
- show proxy status from read-model state rather than running repair from a read path;
- expose retry or repair affordances only through explicit operations such as
  `servers.bootstrap-proxy`;
- avoid retry affordances for validation, not-found, conflict, and invariant errors.

## Test Assertions

Tests must assert:

- `Result` shape;
- `error.code`;
- `error.category`;
- `error.retriable`;
- phase in `details.phase`;
- `serverId` or related blocker metadata where relevant.

## Current Implementation Notes And Migration Gaps

`servers.show`, `servers.rename`, `servers.deactivate`, `servers.delete-check`, and guarded
`servers.delete` are active in this lifecycle spec.

`servers.delete` uses soft-delete lifecycle state. Normal server reads omit deleted servers while
historical records retain server ids.

## Open Questions

- None for `servers.show`, display-name-only rename, one-way deactivate, or delete-check preview
  semantics.
