# Server Bootstrap Error Spec

## Normative Contract

Server bootstrap uses the shared platform error model and neverthrow conventions. This file defines only the server/proxy-specific error profile for registration, connectivity, proxy bootstrap, and readiness.

Registration success is not readiness. Connectivity failure, proxy bootstrap failure, and readiness failure after acceptance must be represented through durable lifecycle/attempt state and formal events.

## Global References

This spec inherits:

- [ADR-003: Server Connect Public Versus Internal](../decisions/ADR-003-server-connect-public-vs-internal.md)
- [ADR-004: Server Readiness State Storage](../decisions/ADR-004-server-readiness-state-storage.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-019: Edge Proxy Provider And Observable Configuration](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)
- [Error Model](./model.md)
- [neverthrow Conventions](./neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

The shared documents define error shape, categories, consumer mapping, exception boundaries, retry semantics, and post-acceptance failure semantics.

## Server Bootstrap Error Details

Server/proxy errors must include command or event name, phase, related server/proxy state, and safe attempt metadata:

```ts
type ServerBootstrapErrorDetails = {
  commandName?: "servers.register" | "servers.connect" | "servers.bootstrap-proxy";
  eventName?:
    | "server-connected"
    | "proxy-bootstrap-requested"
    | "proxy-installed"
    | "proxy-install-failed"
    | "server-ready";
  phase:
    | "register"
    | "credential-resolution"
    | "connect"
    | "proxy-bootstrap"
    | "proxy-network"
    | "proxy-container"
    | "server-ready"
    | "event-publication"
    | "event-consumption";
  step?: string;
  relatedEntityId?: string;
  relatedState?: string;
  serverId?: string;
  edgeProxyMode?: "disabled" | "provider";
  edgeProxyProviderKey?: string;
  attemptId?: string;
  correlationId?: string;
  causationId?: string;
  retryAfter?: string;
};
```

Secrets, private keys, full SSH command output, and raw Docker logs that may contain secrets must not be stored in error details.

## Admission Errors

Admission errors reject the command and return `err(DomainError)`.

| Error code | Phase | Retriable | Server/proxy-specific meaning |
| --- | --- | --- | --- |
| `validation_error` | `register`, `connect`, `proxy-bootstrap` | No | Input is missing, malformed, or violates command schema. |
| `not_found` | `credential-resolution`, `connect`, `proxy-bootstrap` | No | Server or referenced credential does not exist. |
| `conflict` | `register` | No | Duplicate registration or incompatible existing server policy. |
| `invariant_violation` | lifecycle transition | No | Command attempted a lifecycle transition not allowed by server/proxy state. |
| `provider_error` | `connect`, `proxy-bootstrap` | Conditional | Provider rejects or cannot perform requested operation before acceptance. |
| `infra_error` | repository/adapter boundary | Conditional | Persistence, shell, SSH, Docker, or local runtime boundary failed before state could be safely persisted. |

## Async Failure Profile

| Error condition | Required representation | Retriable |
| --- | --- | --- |
| Connectivity check fails | No `server-connected`; record failed connect attempt with `phase = connect`. | Depends on check failure. |
| Readiness not achieved | No `server-ready`; record failure with `phase = server-ready` and related state. | Depends on missing gate. |
| Edge proxy kind unsupported | `proxy-install-failed` with `errorCode = edge_proxy_kind_unsupported`. | No unless configuration or compatibility aliases change. |
| Edge proxy provider key unsupported | `proxy-install-failed` with `errorCode = edge_proxy_provider_unsupported`. | No unless provider capability changes are expected. |
| Edge proxy provider unavailable | `proxy-install-failed` with `errorCode = proxy_provider_unavailable`. | Usually yes after provider registration, package, or composition-root configuration is repaired. |
| Proxy network preparation fails | `proxy-install-failed` with `errorCode = edge_proxy_network_failed` and `failurePhase = proxy-network`. | Usually yes if Docker/provider can recover. |
| Proxy container start fails | `proxy-install-failed` with `errorCode = edge_proxy_start_failed` and `failurePhase = proxy-container`. | Usually yes unless the provider reports invalid configuration. |
| Runtime bootstrap execution fails | `proxy-install-failed` with `failurePhase = runtime-error`. | Usually yes after host/Docker/SSH/runtime state is repaired. |
| Generated access route requires proxy but proxy is failed | Deployment route resolution or execution records `phase = proxy-readiness`; server edge proxy state remains failed. | Depends on proxy failure. |
| Event handler crashes before terminal state | Persist event-processing failure or retryable attempt state; do not publish terminal success/failure until state is known. | Yes |
| Duplicate event consumed | No new side effect; return `ok`. | Not applicable |

## Command Result Semantics

`servers.register`:

- returns `ok({ id })` when server metadata is accepted;
- returns `err(DomainError)` for admission validation, duplicate policy, or persistence failures;
- does not fail just because later proxy bootstrap fails.

`servers.connect`:

- returns `ok({ id })` when the connectivity lifecycle request is accepted or connectivity succeeds in a synchronous implementation;
- records failed connectivity as lifecycle/attempt state when the request was accepted;
- returns `err(DomainError)` only for admission failures.

`servers.bootstrap-proxy`:

- returns `ok({ serverId, attemptId })` when proxy bootstrap attempt is accepted;
- is the canonical public repair/retry operation behind `appaloft server proxy repair <serverId>` and `POST /api/servers/{serverId}/edge-proxy/bootstrap`;
- allocates a new attempt id when invoked as repair/retry and must not replay an old `proxy-bootstrap-requested` event;
- records terminal proxy failure as `edgeProxy.status = failed` and publishes `proxy-install-failed`;
- returns `err(DomainError)` only when the attempt cannot be accepted or state cannot be safely persisted.

## Consumer Requirements

UI, CLI, HTTP API, background workers, and event consumers must use the shared mappings in [Error Model](./model.md). Server/proxy consumers additionally must:

- display readiness from read-model state;
- show proxy failures using `errorCode`, `phase`, and `retriable`;
- distinguish registration acceptance from server readiness;
- expose failed connect/proxy/readiness state when queried or watched;
- expose a repair action for retriable proxy failures only through `servers.bootstrap-proxy`;
- avoid leaking raw secrets or private command output.

## Test Assertions

Server/proxy tests must assert:

- structured `Result` shape for admission errors;
- server/proxy-specific `error.code`;
- server/proxy-specific `phase`;
- `serverId`, `edgeProxyProviderKey`, and `attemptId` when relevant;
- no `server-connected` on failed connectivity;
- `proxy-install-failed` plus failed edge proxy state for proxy failure;
- new attempt id for proxy retry;
- `server doctor` proxy failures can be followed by `servers.bootstrap-proxy` without mutating user workload containers.

The shared neverthrow assertion style is defined in [neverthrow Conventions](./neverthrow-conventions.md).

## Current Implementation Notes And Migration Gaps

Current `DomainError` has `code`, `category`, `message`, `retryable`, and optional `details`; phase/attempt details are not uniformly present.

Current proxy bootstrapper returns `Result<ServerEdgeProxyBootstrapResult>`, and failed bootstrap can be returned as `ok({ status: "failed", errorCode })`.

Current connectivity testing returns a `ServerConnectivityResult` with `healthy`, `degraded`, or `unreachable`, but does not persist a connectivity attempt or server lifecycle status.

Current event handler records proxy failure on the server aggregate but does not publish the pulled `deployment_target.edge_proxy_bootstrap_failed` event after marking failure.

Current errors may still include `proxyKind`; ADR-019 treats that as provider-selection migration data. Target error details use provider-neutral mode/key fields.

Current code exposes public `servers.bootstrap-proxy` CLI and HTTP/oRPC entrypoints as the accepted
proxy repair operation. It rejects public repair calls that provide their own attempt id.

## Open Questions

- None for proxy retry classification. Raw worker command output storage remains an observability design detail and must stay outside aggregate/read-model error details unless a separate redacted log table is specified.
