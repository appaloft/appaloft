# Server Bootstrap And Proxy Workflow Spec

## Normative Contract

Server bootstrap is an async lifecycle workflow:

```text
register server metadata
  -> verify connectivity
  -> bootstrap edge proxy when required
  -> mark server ready or failed/not-ready
```

Registration success is not readiness. Connectivity and proxy bootstrap are formal lifecycle stages.

## Global References

This workflow inherits:

- [ADR-003: Server Connect Public Versus Internal](../decisions/ADR-003-server-connect-public-vs-internal.md)
- [ADR-004: Server Readiness State Storage](../decisions/ADR-004-server-readiness-state-storage.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-019: Edge Proxy Provider And Observable Configuration](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

This file defines the server/proxy-specific lifecycle chain and readiness semantics.

## End-To-End Workflow

```text
servers.register
  -> server metadata persisted
  -> servers.connect
  -> server-connected
  -> proxy-bootstrap-requested, if edge proxy provider is required
  -> proxy-installed
  -> server-ready
```

For disabled edge proxy:

```text
servers.register
  -> servers.connect
  -> server-connected
  -> server-ready
```

For proxy failure:

```text
servers.register
  -> servers.connect
  -> server-connected
  -> proxy-bootstrap-requested
  -> proxy-install-failed
  -> server remains connected but not ready for proxy-backed deployments
```

## Synchronous Admission

Synchronous admission includes:

- server registration input validation;
- duplicate registration policy;
- server id and credential reference validation;
- provider/proxy kind support validation;
- proxy bootstrap attempt admission.

Synchronous rejection returns `err(DomainError)` and must not publish lifecycle success events.

## Async Work

Async work includes:

- provider-specific connectivity probes;
- SSH/local shell/Docker readiness checks;
- proxy network creation or verification;
- proxy container creation or verification;
- readiness finalization.

Async work must persist state and publish formal events after durable transitions.

## State Model

Lifecycle states may be persisted directly or projected from attempt/proxy state, but the read model must expose the same semantics:

```text
registered
connecting
connected
proxy_bootstrapping
ready
failed | not_ready
```

Edge proxy state:

```text
disabled
pending
starting
ready
failed
```

Server readiness:

- `ready` when connectivity is valid and proxy requirement is satisfied;
- `not_ready` when required connectivity or proxy bootstrap fails;
- `failed` or equivalent terminal failure state includes phase and retriable flag.

Generated default access routes require proxy readiness when the selected resource uses reverse-proxy exposure. A connected server with failed proxy bootstrap is still not ready for generated proxy-backed routes.

## Event / State Mapping

| Event | Meaning | State impact |
| --- | --- | --- |
| `server-connected` | Connectivity requirements satisfied. | Server can move to `connected`. |
| `proxy-bootstrap-requested` | Proxy bootstrap attempt requested. | Edge proxy moves to `starting`; workflow moves to `proxy_bootstrapping`. |
| `proxy-installed` | Required proxy is ready. | Edge proxy moves to `ready`; server may move to `ready`. |
| `proxy-install-failed` | Proxy attempt failed. | Edge proxy moves to `failed`; server remains not ready for proxy-backed deployments. |
| `server-ready` | All readiness gates satisfied. | Server read model reports ready. |

## Failure Visibility

Admission failures are returned to the caller as `err(DomainError)`.

Server/proxy async failures are exposed through:

- server read-model readiness/status;
- edge proxy status/error fields;
- workflow/attempt status when available;
- `proxy-install-failed` or a connectivity failure state;
- logs/traces with correlation and causation ids.

## Server/Proxy Retry Points

Connectivity retry is a new connectivity attempt.

Proxy bootstrap retry is a new proxy bootstrap attempt.

The accepted retry/repair operation is `servers.bootstrap-proxy`. Public CLI/API entrypoints may
label the user action as proxy repair, but the workflow is still a new bootstrap attempt:

```text
server doctor reports proxy failure
  -> operator runs servers.bootstrap-proxy
  -> proxy-bootstrap-requested(new attemptId)
  -> provider ensure plan verifies or recreates provider-owned proxy infrastructure
  -> proxy-installed | proxy-install-failed
```

Repair must not touch user workload containers. It is limited to provider-owned proxy
infrastructure and provider-owned networks or volumes.

Previous failed attempts remain historical state and must not be erased by retry.

## Entry Boundaries

Web may guide the user through registration, credential configuration, connectivity testing, and readiness display.

CLI may expose separate commands for register, credential configuration, connectivity test, and proxy repair. The canonical proxy repair command is `appaloft server proxy repair <serverId>`, dispatched as `servers.bootstrap-proxy`.

API must expose strict command inputs and read-model status; it must not prompt.

Diagnostic draft connectivity checks do not mutate lifecycle state.

Existing-target connectivity diagnostics may include provider-rendered edge proxy checks when the
server has provider-backed proxy intent. These checks are observational: they can inspect the proxy
container image, scan provider logs, and run bounded temporary route probes, but they must clean up
probe containers and must not mark the server connected, ready, failed, or repaired.

## Edge Proxy Intent Reconfiguration

`servers.configure-edge-proxy` is the intent-only operation for changing a server's desired edge
proxy kind after registration.

The operation belongs to the deployment target lifecycle workflow, not to proxy bootstrap work. It
must not publish `proxy-bootstrap-requested`, run provider ensure plans, create or delete provider
containers, reload the proxy, apply route configuration, or remove provider-owned artifacts.

When the configured kind is `none`, later generated/default access and custom-domain proxy-backed
target selection must treat the server as no-proxy. Historical deployment route snapshots,
server-applied route state, domain bindings, audit records, and provider-owned artifacts remain in
place until explicit future cleanup or route lifecycle operations handle them.

When the configured kind changes from `none` to `traefik` or `caddy`, or between provider-backed
kinds, the current edge proxy status becomes `pending`. The system does not synchronously bootstrap
proxy infrastructure as part of the configure command. Operators can run
`servers.bootstrap-proxy` / `appaloft server proxy repair <serverId>` to request a new bootstrap
attempt, and later deployments that require proxy-backed access may run idempotent provider ensure
according to the runtime route-realization workflow.

Inactive servers reject `servers.configure-edge-proxy` with `server_inactive`; inactive targets do
not receive new deployment, scheduling, or proxy target configuration work. Deleted servers remain
hidden from the ordinary configure entrypoint with `not_found`.

Generated-domain provider selection is not part of server registration input. Server/installation configuration may select the concrete provider adapter, but core/application server commands see only provider-neutral proxy readiness and route eligibility state.

Edge proxy provider selection is resolved through the provider registry and composition-root configuration. Server registration may record provider intent or a provider key, but command handlers and process managers must not branch on concrete proxy products to render bootstrap commands, labels, logs, or diagnostics.

Proxy bootstrap must use the provider contract defined by [Edge Proxy Provider And Route Realization](./edge-proxy-provider-and-route-realization.md). The provider renders the ensure plan; runtime execution runs it locally or over SSH.

## Current Implementation Notes And Migration Gaps

Current `servers.register` persists a `DeploymentTarget` and publishes `deployment_target.registered`.

Current event handling starts proxy bootstrap directly from `deployment_target.registered`, before a formal durable `server-connected` event exists.

Current code implements public `servers.bootstrap-proxy` through CLI and HTTP/oRPC as the explicit
repair/retry path for provider-owned edge proxy infrastructure. It allocates a new `pxy_*` attempt
id, records edge proxy starting/ready/failed state, and publishes canonical proxy request/terminal
events around the existing provider-backed bootstrapper.

Current `servers.test-connectivity` and draft connectivity checks return diagnostic results but do not update server lifecycle state.

Current `servers.test-connectivity` asks the registered edge proxy provider for diagnostic command
plans and executes them locally or over SSH. Traefik diagnostics verify the expected proxy image,
scan Docker provider logs for compatibility errors, and prove Docker-label route discovery with a
temporary probe container. Failed provider-rendered edge proxy diagnostic checks include safe
`repairCommand` metadata pointing to `appaloft server proxy repair <serverId>`.

Current server read model exposes edge proxy fields but no top-level readiness status.

Current `servers.configure-edge-proxy` changes desired `proxyKind` only. It resets the current
summary status to `disabled` for `none` or `pending` for provider-backed kinds and records
`server-edge-proxy-configured`. It does not create a proxy bootstrap attempt.

Current event bus dispatch is in-memory and fire-and-forget; handler failures are logged and not returned to the original command.

Current proxy bootstrap started/succeeded/failed aggregate events are recorded by aggregate methods.
The explicit `servers.bootstrap-proxy` command publishes the pulled aggregate events after state
changes; the registration-triggered bootstrap handler still needs migration to the same canonical
publication path.

Current runtime bootstrap code still contains concrete proxy branches and must migrate behind edge proxy provider packages governed by ADR-019.

## Open Questions

- None. Server connect exposure and automatic scheduling are governed by [ADR-003](../decisions/ADR-003-server-connect-public-vs-internal.md).
