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
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
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

| Test ID | Preferred automation | Case | Input | Expected result | Expected error | Expected event | Expected state | Retriable |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SERVER-BOOT-CMD-001 | integration | Register with default proxy | `name`, `host`, `providerKey`; no edge proxy override | `ok({ id })` | None | Registration accepted event; connect workflow can start | Server registered; edge proxy pending/provider-backed | No |
| SERVER-BOOT-CMD-002 | integration | Register with proxy disabled | `edgeProxyMode = disabled` | `ok({ id })` | None | Registration accepted event; connect workflow can start | Server registered; edge proxy disabled | No |
| SERVER-BOOT-CMD-003 | integration | Register with invalid input | Missing name/host/provider | `err` | `validation_error`, phase `register` | None | No server created | No |
| SERVER-BOOT-CMD-004 | integration | Duplicate registration | Same provider/host/port or idempotency key | Existing id or `err` per policy | `conflict` if rejected | No duplicate lifecycle event | No duplicate server | No |
| SERVER-BOOT-CMD-005 | integration | Connect existing server | Valid `serverId`, usable credentials | `ok({ id })` | None | `server-connected` | Server connected | No |
| SERVER-BOOT-CMD-006 | integration | Connect missing server | Unknown `serverId` | `err` | `not_found`, phase `connect` | None | No state change | No |
| SERVER-BOOT-CMD-007 | integration | Connect unreachable server | Connectivity probes fail after connect attempt accepted | Accepted attempt result or persisted failed attempt | Async connect failure with phase `connect` | No `server-connected` | Server not ready | Depends |
| SERVER-BOOT-CMD-008 | integration | Diagnostic draft connectivity | Draft server input | Diagnostic result | None unless schema invalid | None | No persisted lifecycle state | No |
| SERVER-BOOT-CMD-009 | integration | Diagnostic existing-target proxy compatibility | Existing provider-backed target with usable runtime executor | Diagnostic result includes provider-rendered proxy checks | None unless provider diagnostics cannot be rendered | None | No lifecycle state change; failed proxy checks degrade the diagnostic result only | Yes for transient runtime/proxy errors |
| SERVER-BOOT-CMD-010 | integration | Bootstrap proxy for connected server | `serverId`, edge proxy provider key, attempt id | `ok({ serverId, attemptId })` | None | `proxy-bootstrap-requested` | Edge proxy starting | No |
| SERVER-BOOT-CMD-011 | integration | Repair proxy after doctor failure | `serverId`, reason `repair`, no attempt id | `ok({ serverId, attemptId })` with a new attempt id | None | `proxy-bootstrap-requested` | New proxy bootstrap attempt starts; provider-owned proxy may be recreated; user workload containers untouched | Depends on underlying proxy failure |
| SERVER-BOOT-CMD-012 | integration | Repair proxy when already ready | `serverId`, reason `repair`, proxy already ready but compatible | `ok({ serverId, attemptId })` or idempotent ready result per implementation policy | None | None or `proxy-bootstrap-requested` only if a new verification attempt is intentionally recorded | Proxy remains ready; no duplicate provider-owned containers | No |
| SERVER-BOOT-CMD-013 | integration | Bootstrap proxy when disabled | `edgeProxyMode = disabled` | `err` or no-op per command policy | `validation_error` or invariant, phase `proxy-bootstrap` | None | Edge proxy disabled | No |

## Entrypoint Matrix

| Test ID | Preferred automation | Case | Entry | Input/read state | Expected observable result | Companion lower-level coverage |
| --- | --- | --- | --- | --- | --- | --- |
| SERVER-BOOT-ENTRY-001 | e2e-preferred | CLI registers server and CLI read model observes it | CLI command plus CLI read model | `yundu server register --provider local-shell --proxy-kind none`; then `yundu server list` | Register returns a server id; CLI list includes the same id, name, host, provider key, and disabled proxy summary | `SERVER-BOOT-CMD-002` covers repository state, accepted event, and edge proxy disabled semantics at integration level |
| SERVER-BOOT-ENTRY-002 | e2e-preferred | HTTP registers server and HTTP read model observes it | HTTP API command plus HTTP read model | `POST /api/servers` with `providerKey = local-shell`, `proxyKind = none`; then `GET /api/servers` | HTTP register returns `201` and server id; HTTP list includes the same id, name, host, provider key, and disabled proxy summary | `SERVER-BOOT-CMD-002` covers repository state, accepted event, and edge proxy disabled semantics at integration level |

## Event Matrix

| Test ID | Preferred automation | Case | Given event | Existing state | Expected result | Expected follow-up event | Expected state | Retriable |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SERVER-BOOT-EVT-001 | integration | Server connected, proxy required | `server-connected` | Server edge proxy provider is required | `ok` | `proxy-bootstrap-requested` | Connected, proxy attempt requested | No |
| SERVER-BOOT-EVT-002 | integration | Server connected, proxy disabled | `server-connected` | Edge proxy disabled | `ok` | `server-ready` | Ready | No |
| SERVER-BOOT-EVT-003 | integration | Duplicate server connected | Same event or attempt repeated | Proxy bootstrap already requested/ready | `ok` | None | No duplicate attempt | No |
| SERVER-BOOT-EVT-004 | integration | Proxy bootstrap requested succeeds | `proxy-bootstrap-requested` | Connected server; bootstrapper returns ready | `ok` | `proxy-installed` | Edge proxy ready | No |
| SERVER-BOOT-EVT-005 | integration | Proxy bootstrap requested fails | `proxy-bootstrap-requested` | Connected server; bootstrapper returns failed | `ok` | `proxy-install-failed` | Edge proxy failed; server not ready | Depends on error |
| SERVER-BOOT-EVT-006 | integration | Generated route requires ready proxy | Deployment route resolver checks server state | Edge proxy failed or not ready | `err` or deployment failure according to detection phase | None or deployment failure event | Server remains not ready for proxy-backed access | Depends |
| SERVER-BOOT-EVT-007 | integration | Proxy bootstrap duplicate after ready | Same attempt event | Edge proxy ready for attempt | `ok` | None | Remains ready | No |
| SERVER-BOOT-EVT-008 | integration | Proxy bootstrap duplicate after failed | Same attempt event | Attempt already failed | `ok` | None | Remains failed | Retry requires new attempt |
| SERVER-BOOT-EVT-009 | integration | Proxy installed | `proxy-installed` | Connectivity still valid | `ok` | `server-ready` | Server ready | No |
| SERVER-BOOT-EVT-010 | integration | Proxy install failed | `proxy-install-failed` | Failed proxy attempt | `ok` | Retry scheduled only by policy | Server not ready | Depends |
| SERVER-BOOT-EVT-011 | integration | Server ready duplicate | `server-ready` repeated | Already ready | `ok` | None | Remains ready | No |

## Async Failure Matrix

| Test ID | Preferred automation | Failure | Phase | Expected error code | Expected state | Expected event | Retriable |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SERVER-BOOT-ASYNC-001 | integration | Required credential missing | `connect` | `validation_error` or `not_found` | No connected state | None | No |
| SERVER-BOOT-ASYNC-002 | integration | SSH unreachable | `connect` | provider/runtime-specific code | Not ready | No `server-connected` | Yes if transient |
| SERVER-BOOT-ASYNC-003 | integration | Docker unavailable | `connect` | provider/runtime-specific code | Not ready | No `server-connected` | Usually yes |
| SERVER-BOOT-ASYNC-004 | integration | Proxy provider unsupported | `proxy-bootstrap` | `edge_proxy_provider_unsupported` | Edge proxy failed | `proxy-install-failed` | No |
| SERVER-BOOT-ASYNC-005 | integration | Proxy kind unsupported | `proxy-bootstrap` | `edge_proxy_kind_unsupported` | Edge proxy failed | `proxy-install-failed` | No |
| SERVER-BOOT-ASYNC-006 | integration | Proxy network failed | `proxy-network` | `edge_proxy_network_failed` | Edge proxy failed | `proxy-install-failed` | Usually yes |
| SERVER-BOOT-ASYNC-007 | integration | Proxy container start failed | `proxy-container` | `edge_proxy_start_failed` | Edge proxy failed | `proxy-install-failed` | Usually yes |
| SERVER-BOOT-ASYNC-008 | integration | State transition invalid | lifecycle transition | `invariant_violation` | Unchanged | No success event | No |
| SERVER-BOOT-ASYNC-009 | integration | Event worker crash before final persistence | `event-consumption` | `retryable_error` | Attempt retryable/unknown | No terminal event | Yes |

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
- `yundu server proxy repair <serverId>` dispatches `servers.bootstrap-proxy` and creates a new
  proxy bootstrap attempt rather than replaying the old event.
- proxy repair does not remove, restart, or mutate user workload containers.

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
Given a connected server with edgeProxyProviderKey resolved.
When the process manager handles server-connected.
Then proxy-bootstrap-requested is emitted with serverId, edgeProxyProviderKey, attemptId, reason, correlationId, and causationId.
And server-ready is not emitted until proxy-installed is handled.
```

## Current Implementation Notes And Migration Gaps

Existing coverage includes `SERVER-BOOT-CMD-001`, `SERVER-BOOT-CMD-002`, and
`SERVER-BOOT-CMD-003` in `packages/application/test/register-server.test.ts` for the
first-class command boundary. `SERVER-BOOT-ENTRY-001` and `SERVER-BOOT-ENTRY-002` live in
`apps/shell/test/e2e/server-register.test.ts` for the first-class CLI and HTTP entrypoint chains.
Application tests also cover proxy bootstrap success and failure after `deployment_target.registered`,
plus runtime adapter tests for proxy bootstrap plan generation and proxy labels.

The `SERVER-BOOT-ENTRY-*` e2e assertions are intentionally limited to public observability: command
success and server visibility through the matching public read surface. Exact repository values,
accepted-event publication, edge proxy state-machine details, and handler delegation remain command
or integration coverage because the user-facing chain cannot observe those internals directly.

Current tests do not cover the full canonical chain because `server-connected`, `proxy-bootstrap-requested`, `proxy-installed`, `proxy-install-failed`, and `server-ready` are canonical events.

Current code allows `beginEdgeProxyBootstrap` from any non-disabled edge proxy status, so duplicate-event idempotency must be tightened before tests assert no-op behavior for ready/failed attempts.

Current connectivity tests are diagnostic and do not persist lifecycle state.

Existing-target connectivity tests include provider-rendered edge proxy diagnostics when an edge
proxy provider registry is available. Tests should assert that these diagnostics are read-only,
surface stale or incompatible proxy images, and can prove Docker label discovery through a bounded
temporary route probe. Runtime adapter tests cover `repairCommand` metadata on failed
provider-rendered edge proxy diagnostics.

Current proxy bootstrap handler marks started/ready/failed but does not publish the aggregate events recorded by those state transitions.

Current code exposes `servers.bootstrap-proxy` through CLI and HTTP/oRPC as the accepted proxy
repair operation. Application tests cover new attempt id allocation, canonical proxy request and
terminal events, retriable failure classification, public attempt id rejection, and disabled proxy
rejection. CLI/API are typechecked but do not yet have dedicated transport-level integration tests.

## Open Questions

- None. Tests should follow the decisions recorded in the server/proxy command, workflow, and error specs.
