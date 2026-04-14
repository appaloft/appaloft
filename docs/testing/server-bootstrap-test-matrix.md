# Server Bootstrap And Proxy Spec-Driven Test Matrix

## Normative Contract

Tests for server bootstrap must follow the command, event, workflow, error, and async lifecycle specs for:

```text
servers.register
  -> servers.connect
  -> server-connected
  -> proxy-bootstrap-requested
  -> proxy-installed | proxy-install-failed
  -> server-ready
```

Tests must distinguish registration acceptance from connectivity, proxy readiness, and server readiness.

## Global References

This test matrix inherits:

- [ADR-003: Server Connect Public Versus Internal](../decisions/ADR-003-server-connect-public-vs-internal.md)
- [ADR-004: Server Readiness State Storage](../decisions/ADR-004-server-readiness-state-storage.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [Spec-Driven Testing](./SPEC_DRIVEN_TESTING.md)

This file defines server/proxy-specific test cases and expected lifecycle outcomes.

## Test Layers

| Layer | Server/proxy-specific focus |
| --- | --- |
| Command schema | `servers.register`, `servers.connect`, and proxy bootstrap command input validation. |
| Aggregate/state-machine | Edge proxy status transitions and server readiness rules. |
| Use case/handler | Handler delegates; use case persists state and returns typed `Result`. |
| Event/process manager | Event ordering, idempotency, retry, and async failure state. |
| Runtime adapter | Connectivity checks and proxy bootstrap result mapping. |
| Read model | Edge proxy/readiness status exposed to UI/CLI/API. |
| Entry workflow | Web/CLI/API differences converge on command semantics. |

## Given / When / Then Template

```md
Given:
- Server repository state:
- Credential state:
- Connectivity checker behavior:
- Proxy bootstrapper behavior:
- Existing event/attempt state:

When:
- Dispatch the command or consume the event:

Then:
- Result:
- Error:
- Events:
- Server state:
- Edge proxy state:
- Retry/idempotency behavior:
```

## Command Matrix

| Case | Input | Expected result | Expected error | Expected event | Expected state | Retriable |
| --- | --- | --- | --- | --- | --- | --- |
| Register with default proxy | `name`, `host`, `providerKey`; no `proxyKind` | `ok({ id })` | None | Registration accepted event; connect workflow can start | Server registered; edge proxy pending | No |
| Register with proxy disabled | `proxyKind = none` | `ok({ id })` | None | Registration accepted event; connect workflow can start | Server registered; edge proxy disabled | No |
| Register with invalid input | Missing name/host/provider | `err` | `validation_error`, phase `register` | None | No server created | No |
| Duplicate registration | Same provider/host/port or idempotency key | Existing id or `err` per policy | `conflict` if rejected | No duplicate lifecycle event | No duplicate server | No |
| Connect existing server | Valid `serverId`, usable credentials | `ok({ id })` | None | `server-connected` | Server connected | No |
| Connect missing server | Unknown `serverId` | `err` | `not_found`, phase `connect` | None | No state change | No |
| Connect unreachable server | Connectivity probes fail after connect attempt accepted | Accepted attempt result or persisted failed attempt | Async connect failure with phase `connect` | No `server-connected` | Server not ready | Depends |
| Diagnostic draft connectivity | Draft server input | Diagnostic result | None unless schema invalid | None | No persisted lifecycle state | No |
| Bootstrap proxy for connected server | `serverId`, proxy kind, attempt id | `ok({ serverId, attemptId })` | None | `proxy-bootstrap-requested` | Edge proxy starting | No |
| Bootstrap proxy with kind none | `proxyKind = none` | `err` or no-op per command policy | `validation_error` or invariant, phase `proxy-bootstrap` | None | Edge proxy disabled | No |

## Event Matrix

| Case | Given event | Existing state | Expected result | Expected follow-up event | Expected state | Retriable |
| --- | --- | --- | --- | --- | --- | --- |
| Server connected, proxy required | `server-connected` | Server proxy kind `traefik` or `caddy` | `ok` | `proxy-bootstrap-requested` | Connected, proxy attempt requested | No |
| Server connected, proxy disabled | `server-connected` | Edge proxy disabled | `ok` | `server-ready` | Ready | No |
| Duplicate server connected | Same event or attempt repeated | Proxy bootstrap already requested/ready | `ok` | None | No duplicate attempt | No |
| Proxy bootstrap requested succeeds | `proxy-bootstrap-requested` | Connected server; bootstrapper returns ready | `ok` | `proxy-installed` | Edge proxy ready | No |
| Proxy bootstrap requested fails | `proxy-bootstrap-requested` | Connected server; bootstrapper returns failed | `ok` | `proxy-install-failed` | Edge proxy failed; server not ready | Depends on error |
| Proxy bootstrap duplicate after ready | Same attempt event | Edge proxy ready for attempt | `ok` | None | Remains ready | No |
| Proxy bootstrap duplicate after failed | Same attempt event | Attempt already failed | `ok` | None | Remains failed | Retry requires new attempt |
| Proxy installed | `proxy-installed` | Connectivity still valid | `ok` | `server-ready` | Server ready | No |
| Proxy install failed | `proxy-install-failed` | Failed proxy attempt | `ok` | Retry scheduled only by policy | Server not ready | Depends |
| Server ready duplicate | `server-ready` repeated | Already ready | `ok` | None | Remains ready | No |

## Async Failure Matrix

| Failure | Phase | Expected error code | Expected state | Expected event | Retriable |
| --- | --- | --- | --- | --- | --- |
| Required credential missing | `connect` | `validation_error` or `not_found` | No connected state | None | No |
| SSH unreachable | `connect` | provider/runtime-specific code | Not ready | No `server-connected` | Yes if transient |
| Docker unavailable | `connect` | provider/runtime-specific code | Not ready | No `server-connected` | Usually yes |
| Proxy provider unsupported | `proxy-bootstrap` | `edge_proxy_provider_unsupported` | Edge proxy failed | `proxy-install-failed` | No |
| Proxy kind unsupported | `proxy-bootstrap` | `edge_proxy_kind_unsupported` | Edge proxy failed | `proxy-install-failed` | No |
| Proxy network failed | `proxy-network` | `edge_proxy_network_failed` | Edge proxy failed | `proxy-install-failed` | Usually yes |
| Proxy container start failed | `proxy-container` | `edge_proxy_start_failed` | Edge proxy failed | `proxy-install-failed` | Usually yes |
| State transition invalid | lifecycle transition | `invariant_violation` | Unchanged | No success event | No |
| Event worker crash before final persistence | `event-consumption` | `retryable_error` | Attempt retryable/unknown | No terminal event | Yes |

## State Progression Assertions

Tests must assert valid order:

```text
registered
  -> connecting
  -> connected
  -> proxy_bootstrapping
  -> ready
```

or for proxy disabled:

```text
registered
  -> connecting
  -> connected
  -> ready
```

or for proxy failure:

```text
registered
  -> connecting
  -> connected
  -> proxy_bootstrapping
  -> not_ready with edgeProxy.status = failed
```

## Idempotency Assertions

Tests must prove:

- duplicate registration does not create duplicate server metadata according to the chosen policy;
- duplicate `server-connected` does not create duplicate proxy bootstrap attempts;
- duplicate `proxy-bootstrap-requested` for a completed attempt does not rerun bootstrap commands;
- duplicate `proxy-installed` does not duplicate `server-ready`;
- duplicate `proxy-install-failed` does not duplicate retry scheduling;
- retry creates a new proxy bootstrap attempt id.

## Server/Proxy Error Assertion Example

```ts
expect(result.isErr()).toBe(true);

if (result.isErr()) {
  expect(result.error.code).toBe("not_found");
  expect(result.error.retryable).toBe(false);
  expect(result.error.details?.phase).toBe("connect");
  expect(result.error.details?.relatedEntityId).toBe(serverId);
}
```

## Server/Proxy Event Assertion Example

```md
Given a connected server with proxyKind = traefik.
When the process manager handles server-connected.
Then proxy-bootstrap-requested is emitted with serverId, proxyKind, attemptId, correlationId, and causationId.
And server-ready is not emitted until proxy-installed is handled.
```

## Current Implementation Notes And Migration Gaps

Existing coverage includes application tests for proxy bootstrap success and failure after `deployment_target.registered`, plus runtime adapter tests for proxy bootstrap plan generation and proxy labels.

Current tests do not cover the full canonical chain because `server-connected`, `proxy-bootstrap-requested`, `proxy-installed`, `proxy-install-failed`, and `server-ready` are canonical events.

Current code allows `beginEdgeProxyBootstrap` from any non-disabled edge proxy status, so duplicate-event idempotency must be tightened before tests assert no-op behavior for ready/failed attempts.

Current connectivity tests are diagnostic and do not persist lifecycle state.

Current proxy bootstrap handler marks started/ready/failed but does not publish the aggregate events recorded by those state transitions.

## Open Questions

- None. Tests should follow the decisions recorded in the server/proxy command, workflow, and error specs.
