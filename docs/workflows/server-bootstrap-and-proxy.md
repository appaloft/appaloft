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
  -> proxy-bootstrap-requested, if proxyKind is traefik or caddy
  -> proxy-installed
  -> server-ready
```

For `proxyKind = none`:

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

Previous failed attempts remain historical state and must not be erased by retry.

## Entry Boundaries

Web may guide the user through registration, credential configuration, connectivity testing, and readiness display.

CLI may expose separate commands for register, credential configuration, connectivity test, and future connect/proxy retry.

API must expose strict command inputs and read-model status; it must not prompt.

Diagnostic draft connectivity checks do not mutate lifecycle state.

## Current Implementation Notes And Migration Gaps

Current `servers.register` persists a `DeploymentTarget` and publishes `deployment_target.registered`.

Current event handling starts proxy bootstrap directly from `deployment_target.registered`, before a formal durable `server-connected` event exists.

Current `servers.test-connectivity` and draft connectivity checks return diagnostic results but do not update server lifecycle state.

Current server read model exposes edge proxy fields but no top-level readiness status.

Current event bus dispatch is in-memory and fire-and-forget; handler failures are logged and not returned to the original command.

Current proxy bootstrap started/succeeded/failed aggregate events are recorded by aggregate methods but not published by the current bootstrap handler after state changes.

## Open Questions

- None. Server connect exposure and automatic scheduling are governed by [ADR-003](../decisions/ADR-003-server-connect-public-vs-internal.md).
