# ADR-004: Server Readiness State Storage

Status: Accepted

Date: 2026-04-14

## Decision

Server readiness is a derived contract over durable write-side lifecycle facts. It must not be represented only as an editable top-level string status and must not be guarded from a stale read model.

The write side must persist the facts that determine readiness:

- server metadata and provider policy;
- credential availability or execution policy;
- latest connectivity attempt summary;
- edge proxy intent and latest proxy bootstrap summary;
- terminal or retryable failure phase when readiness is blocked.

Historical connectivity attempts and proxy bootstrap attempts should be stored in a dedicated lifecycle/process attempt store. The `DeploymentTarget` aggregate may keep the current summary fields required for invariants and admission guards, but the attempt history is not owned by read models.

The server read model may expose a derived readiness value such as:

```text
unknown
registered
connecting
connected
proxy_bootstrapping
ready
not_ready
degraded
```

That read-model readiness is consumer-facing. Command admission must validate readiness from write-side aggregate/process state, not from the read model alone.

`server-ready` may be published only after all readiness gates are satisfied and the relevant write-side state is durable.

Connectivity failures must be persisted as failed connectivity attempts or lifecycle state. They must not exist only in transient logs or read-model-only fields.

By default, `degraded` connectivity is not ready for proxy-backed deployments. A provider may allow degraded connectivity only through an explicit provider policy that names which operations remain allowed.

## Governed Specs

- [servers.register / servers.connect Command Spec](../commands/servers.register-or-connect.md)
- [Server Bootstrap And Proxy Workflow Spec](../workflows/server-bootstrap-and-proxy.md)
- [Server Bootstrap Error Spec](../errors/server-bootstrap.md)
- [Server Bootstrap Test Matrix](../testing/server-bootstrap-test-matrix.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [Domain Model](../DOMAIN_MODEL.md)

## Implementation Requirements

The write side must define a readiness predicate over durable lifecycle state. That predicate decides whether deployment admission may use the target for proxy-backed deployments.

The read model may derive readiness for UI, CLI, HTTP query responses, and progress views, but write-side command handlers and use cases must not rely on read-model readiness as the sole guard.

Connectivity attempts must include:

- `serverId`;
- `attemptId`;
- status;
- phase;
- retriable flag;
- safe failure code/details;
- timestamps;
- correlation id and causation id when available.

Proxy bootstrap attempts must include:

- `serverId`;
- `proxyKind`;
- `attemptId`;
- status;
- phase or failure phase;
- retriable flag;
- safe failure code/details;
- timestamps;
- correlation id and causation id when available.

Until a dedicated attempt store exists, storing the latest attempt summary on the aggregate is an acceptable migration step only if it preserves command admission correctness, event publication ordering, and user-visible failure state.

## Consequences

This decision keeps server readiness useful for read models without making query projections part of the write-side consistency boundary.

It also gives retry, idempotency, and failure visibility a durable home. Proxy bootstrap failure can leave the server registered and connected while blocking proxy-backed deployments until a later successful attempt or explicit proxy disable/update.

## Superseded Open Questions

- Should server readiness be a persisted top-level status or a derived read-model status from connectivity and proxy fields?
- Should connectivity failures be persisted on the server aggregate, a separate attempt table, or only a read model?
- Should `degraded` connectivity ever be accepted as connected for specific provider policies?
