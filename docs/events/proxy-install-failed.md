# proxy-install-failed Event Spec

## Normative Contract

`proxy-install-failed` means an edge proxy bootstrap attempt reached terminal failure and the server proxy state has been durably recorded as failed.

It does not delete server metadata and it does not mean the server is unreachable. It means the server is not ready for proxy-backed deployments, including generated default access routes.

## Event Type

Domain lifecycle event for server edge proxy failure, published as an application event through the application layer or outbox.

## Trigger

Publish after:

1. a `proxy-bootstrap-requested` attempt exists;
2. the runtime bootstrapper reports a failed or unsupported proxy bootstrap result, or the worker classifies a bootstrap error as terminal for the attempt;
3. `edgeProxy.status = failed` is durably persisted;
4. structured error details are recorded.

## Publisher

Publisher: proxy bootstrap worker/process manager after persisting failed state.

## Consumers

Expected consumers:

- server read-model projection;
- notification/audit;
- retry scheduler/process manager;
- deployment admission checks.

## Payload

```ts
type ProxyInstallFailedPayload = {
  serverId: string;
  edgeProxyProviderKey: string;
  attemptId: string;
  failedAt: string;
  errorCode: string;
  errorMessage?: string;
  retriable: boolean;
  providerKey: string;
  failurePhase: "proxy-network" | "proxy-container" | "provider-unsupported" | "runtime-error";
  correlationId?: string;
  causationId?: string;
};
```

Payload must not contain private keys, command output with secrets, or raw credential material.

## State Progression

Required state progression:

```text
edgeProxy.status: starting -> failed
proxy_bootstrapping -> proxy_failed
server readiness: not_ready
```

Server metadata remains registered. If the server was connected before proxy failure, it remains connected but not ready for proxy-backed deployments.

## Retry

Retry must be explicit:

```text
proxy-install-failed
  -> operator/process policy requests servers.bootstrap-proxy
  -> new proxy bootstrap attempt id
  -> proxy-bootstrap-requested
```

Retry must not be raw replay of the old `proxy-bootstrap-requested` event.

The accepted public repair entrypoints are `appaloft server proxy repair <serverId>` and
`POST /api/servers/{serverId}/edge-proxy/bootstrap`; both dispatch `servers.bootstrap-proxy`.

Default retry classification:

| Error code | Retriable |
| --- | --- |
| `edge_proxy_kind_unsupported` | No unless configuration or compatibility aliases change. |
| `edge_proxy_provider_unsupported` | No unless provider capability changes are expected. |
| `proxy_provider_unavailable` | Usually yes after provider registration, package, or composition-root configuration is repaired. |
| `edge_proxy_network_failed` | Usually yes if Docker/provider can recover. |
| `edge_proxy_start_failed` | Usually yes unless the provider reports invalid configuration. |
| Runtime execution errors classified as `runtime-error` | Usually yes after host/Docker/SSH/runtime state is repaired. |

## Idempotency

Consumers must dedupe by `(serverId, edgeProxyProviderKey, attemptId)`.

Duplicate failure events must not schedule duplicate retries or duplicate notifications.

## Ordering

`proxy-install-failed` must follow `proxy-bootstrap-requested` for the same attempt id.

It is mutually exclusive with `proxy-installed` for the same attempt id.

## Failure Handling

If failure is retriable, the read model must show retryable failure and the retry owner must be explicit.

If failure is non-retriable, the read model must show terminal proxy failure until configuration changes or an explicit retry command is issued.

Repair handling may verify, restart, recreate, or upgrade only provider-owned proxy infrastructure
and provider-owned networks/volumes. It must not remove, restart, or mutate user workload containers.

## Observability

Logs and traces must include:

- `serverId`;
- `edgeProxyProviderKey`;
- `attemptId`;
- `phase = proxy-bootstrap`;
- `failurePhase`;
- `errorCode`;
- `retriable`;
- `correlationId`;
- `causationId`.

## Current Implementation Notes And Migration Gaps

Current code records `deployment_target.edge_proxy_bootstrap_failed` when `markEdgeProxyFailed` is called. It stores `edgeProxy.status = failed`, `lastErrorCode`, and `lastErrorMessage`.

Runtime bootstrapper failure codes currently include examples such as `edge_proxy_kind_unsupported`, `edge_proxy_provider_unsupported`, `edge_proxy_network_failed`, and `edge_proxy_start_failed`.

The current event handler marks failure but does not publish pulled aggregate events after the mark. The target canonical event is `proxy-install-failed`.

Current runtime state still exposes `proxyKind`; ADR-019 treats that as provider-selection migration data. The target event payload uses `edgeProxyProviderKey`.

Current public `servers.bootstrap-proxy` CLI and HTTP/oRPC entrypoints publish
`proxy-install-failed` when repair reaches terminal failure. Registration-triggered bootstrap still
records legacy aggregate failure events and needs migration to the same canonical terminal event
publication path.

## Open Questions

- None. Raw worker command output storage remains an observability design detail and must stay outside aggregate/read-model failure details unless a separate redacted log table is specified.
