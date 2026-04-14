# servers.register / servers.connect Command Spec

## Normative Contract

Server registration and server connection are distinct lifecycle concerns.

`servers.register` is the user-intent command for creating deployment target metadata. Command success means the server record has been accepted and a server id exists. It does not mean the server is reachable, ready, or proxy-bootstrapped.

`servers.connect` is the lifecycle command or process-manager command for verifying that a registered server can be operated by the platform. It is the formal command boundary for promoting a server from registered metadata to a connected lifecycle state.

Draft connectivity checks may exist for UX preflight, but they must not mutate server lifecycle state or publish `server-connected`.

## Global References

This command family inherits:

- [ADR-003: Server Connect Public Versus Internal](../decisions/ADR-003-server-connect-public-vs-internal.md)
- [ADR-004: Server Readiness State Storage](../decisions/ADR-004-server-readiness-state-storage.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

This file defines only server/proxy command responsibilities and lifecycle semantics.

## Command Roles

| Command | Entrypoint | Role | Success meaning |
| --- | --- | --- | --- |
| `servers.register` | Web, CLI, API, automation | User-intent command | Server metadata is persisted and lifecycle bootstrap can begin. |
| `servers.connect` | Process manager, API/CLI when explicitly requested | Lifecycle command | Connectivity verification request is accepted or completed according to command mode. |
| `servers.test-connectivity` | Web, CLI, API | Diagnostic/preflight command | Connectivity result is returned to the caller; no lifecycle state is changed. |
| `servers.bootstrap-proxy` | Process manager/worker | System command for edge proxy bootstrap | Proxy bootstrap attempt is accepted for a connected server. |

If only one public command exists in a transitional implementation, the source-of-truth model still treats register, connect, and proxy bootstrap as separate responsibilities.

## Input Model

### `servers.register`

| Field | Requirement | Meaning |
| --- | --- | --- |
| `name` | Required | Human-readable deployment target name. |
| `host` | Required | Host or address used by runtime providers. |
| `providerKey` | Required | Provider/runtime adapter key such as local shell or generic SSH. |
| `port` | Optional | Provider connection port. Defaults to provider policy, typically SSH port `22`. |
| `proxyKind` | Optional | `none`, `traefik`, or `caddy`. Defaults to `traefik` unless entry workflow explicitly disables proxy. |
| credential input | Optional workflow input | Credential creation/configuration belongs to credential commands unless the register schema is explicitly expanded. |

### `servers.connect`

| Field | Requirement | Meaning |
| --- | --- | --- |
| `serverId` | Required | Registered server id. |
| `connectivityPolicy` | Optional | Provider-specific readiness requirements. Defaults to provider policy. |
| `attemptId` | Optional but recommended | Idempotency key for a connectivity attempt. |

### `servers.bootstrap-proxy`

| Field | Requirement | Meaning |
| --- | --- | --- |
| `serverId` | Required | Connected server id. |
| `proxyKind` | Required | `traefik` or `caddy`; `none` must not create a bootstrap attempt. |
| `attemptId` | Required | Idempotency key for the proxy bootstrap attempt. |
| `causationId` | Required when event-driven | Event id or command id that requested bootstrap. |

## Synchronous Admission

`servers.register` must synchronously validate:

- required input shape;
- provider key format and support at the application boundary;
- port validity;
- proxy kind validity;
- duplicate server registration policy.

`servers.connect` must synchronously validate:

- server id shape;
- server existence;
- required credential presence for provider policies that require credentials;
- idempotency key validity.

`servers.bootstrap-proxy` must synchronously validate:

- server existence;
- server is connected;
- proxy kind is not `none`;
- requested proxy kind matches the server proxy intent;
- duplicate attempt handling.

Admission failures return `err(DomainError)`.

## Server/Proxy Async Progression

Required progression:

```text
servers.register
  -> server registered
  -> servers.connect, process-manager initiated or explicitly requested
  -> server-connected
  -> proxy-bootstrap-requested, when proxyKind is traefik or caddy
  -> proxy-installed | proxy-install-failed
  -> server-ready, when connectivity and required proxy state are satisfied
```

For `proxyKind = none`:

```text
servers.register
  -> servers.connect
  -> server-connected
  -> server-ready
```

Proxy bootstrap failure persists `edgeProxy.status = failed`, publishes `proxy-install-failed`, and leaves the server registered/connected but not ready for proxy-backed deployments.

## Result Contracts

```ts
type RegisterServerResult = Result<{ id: string }, DomainError>;

type ConnectServerResult = Result<{ id: string }, DomainError>;

type BootstrapServerProxyResult = Result<
  { serverId: string; attemptId: string },
  DomainError
>;
```

Lifecycle failures after async acceptance are represented in server/proxy state and events according to the shared async lifecycle contract.

## Event Contract

The formal event chain for this command family is:

- `server-connected`;
- `proxy-bootstrap-requested`;
- `proxy-installed`;
- `proxy-install-failed`;
- `server-ready`.

`server-connected` is a lifecycle fact. `proxy-bootstrap-requested` is an orchestration request. `proxy-installed`, `proxy-install-failed`, and `server-ready` are lifecycle facts.

## Server Readiness Definition

A server is ready when:

- server metadata is registered;
- provider connectivity requirements are satisfied;
- required credentials are usable for the provider;
- if `proxyKind = none`, proxy status is `disabled` and no proxy bootstrap is required;
- if `proxyKind = traefik | caddy`, edge proxy status is `ready`;
- readiness is durably visible through the server read model.

Proxy bootstrap failure must not delete server metadata. It prevents readiness for proxy-backed deployments until a successful retry or explicit proxy disable/update.

## Idempotency Keys

Server/proxy-specific dedupe keys:

- registration: provider key + host + port, or a caller-supplied idempotency key when added;
- connect attempt: `serverId + attemptId`;
- proxy bootstrap attempt: `serverId + proxyKind + attemptId`;
- events: exact event id when available, otherwise semantic keys from the event specs.

Duplicate registration returns the existing server id or a stable `conflict` according to product policy.

Duplicate connectivity or proxy events must not repeat side effects when state is already `connected`, `ready`, or terminal failed for the same attempt.

## Handler Boundary

Command handlers must:

- receive validated command messages;
- delegate to application services/use cases;
- return typed `Result` values.

Command handlers must not:

- run provider SDK or shell commands directly;
- contain UI/CLI prompt logic;
- update read models directly;
- treat event publication as proof of event-handler success;
- hide proxy bootstrap inside transport adapters.

## Current Implementation Notes And Migration Gaps

Current code has `servers.register`, `servers.configure-credential`, `servers.test-connectivity`, and `servers.test-draft-connectivity`. A concrete `servers.connect` lifecycle command and `servers.bootstrap-proxy` command are not yet confirmed as separate operation-catalog entries.

Current `servers.register` persists a `DeploymentTarget` and emits `deployment_target.registered`. When `proxyKind` is omitted, it defaults to `traefik`.

Current proxy bootstrap is driven by `BootstrapServerEdgeProxyOnTargetRegisteredHandler`, which consumes `deployment_target.registered`. It marks edge proxy status `starting`, calls the runtime bootstrapper, then marks proxy `ready` or `failed`.

Current connectivity testing returns a diagnostic `ServerConnectivityResult`; it does not promote a durable connected/server-ready lifecycle state.

Current aggregate records `deployment_target.edge_proxy_bootstrap_started`, `deployment_target.edge_proxy_bootstrap_succeeded`, and `deployment_target.edge_proxy_bootstrap_failed`, but the current bootstrap event handler does not publish pulled events after marking started/succeeded/failed.

Current server state has persisted edge proxy fields, but no first-class persisted top-level server lifecycle status such as `registered`, `connected`, or `ready`.

## Open Questions

- Should duplicate registration return the existing server id or a `conflict` error?
- What is the explicit operation key for proxy bootstrap retry: `servers.bootstrap-proxy`, `servers.retry-proxy-bootstrap`, or another name?
