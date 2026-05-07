# servers.register / servers.connect Command Spec

## Normative Contract

Server registration and server connection are distinct lifecycle concerns.

`servers.register` is the user-intent command for creating deployment target metadata. Command success means the server record has been accepted and a server id exists. It does not mean the server is reachable, ready, or proxy-bootstrapped.

`servers.connect` is the lifecycle command or process-manager command for verifying that a registered server can be operated by the platform. It is the formal command boundary for promoting a server from registered metadata to a connected lifecycle state.

Draft connectivity checks may exist for UX preflight, but they must not mutate server lifecycle state or publish `server-connected`.

`servers.test-connectivity` must include edge proxy diagnostics when the target has provider-backed
edge proxy intent and the runtime adapter can execute diagnostics for the target provider. The
diagnostic must be provider-rendered through the edge proxy provider contract, then executed by the
runtime adapter locally or over SSH. It may perform bounded temporary Docker probes, but it must
clean them up and must not persist lifecycle state, publish readiness events, or silently repair the
server. Provider-owned proxy repair is performed only by lifecycle bootstrap/repair operations such
as `servers.bootstrap-proxy`, or by idempotent provider ensure during accepted deployment execution.

## Global References

This command family inherits:

- [ADR-003: Server Connect Public Versus Internal](../decisions/ADR-003-server-connect-public-vs-internal.md)
- [ADR-004: Server Readiness State Storage](../decisions/ADR-004-server-readiness-state-storage.md)
- [ADR-019: Edge Proxy Provider And Observable Configuration](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

This file defines only server/proxy command responsibilities and lifecycle semantics.

## Command Roles

| Command | Entrypoint | Role | Success meaning |
| --- | --- | --- | --- |
| `servers.register` | Web, CLI, API, automation | User-intent command | Server metadata is persisted and lifecycle bootstrap can begin. |
| `servers.connect` | Process manager, API/CLI when explicitly requested | Lifecycle command | Connectivity verification request is accepted or completed according to command mode. |
| `servers.test-connectivity` | Web, CLI, API | Diagnostic/preflight command | Connectivity and provider-rendered proxy diagnostic results are returned to the caller; no lifecycle state is changed. |
| `servers.bootstrap-proxy` | Process manager, worker, CLI/API explicit repair | Lifecycle command for edge proxy bootstrap or repair | New proxy bootstrap attempt is accepted for an operable server. |

If only one public command exists in a transitional implementation, the source-of-truth model still treats register, connect, and proxy bootstrap as separate responsibilities.

## Input Model

### `servers.register`

| Field | Requirement | Meaning |
| --- | --- | --- |
| `name` | Required | Human-readable deployment target name. |
| `host` | Required | Host or address used by runtime providers. |
| `providerKey` | Required | Provider/runtime adapter key such as local shell or generic SSH. |
| `targetKind` | Optional | Target shape. Defaults to `single-server`. `orchestrator-cluster` is accepted for future cluster runtime targets such as Docker Swarm, but runtime readiness and deployment support still depend on the registered backend capabilities. |
| `port` | Optional | Provider connection port. Defaults to provider policy, typically SSH port `22`. |
| `edgeProxyMode` | Optional | `disabled` or `provider`. Defaults to configured platform policy. |
| `edgeProxyProviderKey` | Conditional | Required when `edgeProxyMode = provider` and no server/default provider can be resolved. Opaque provider registry key. |
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
| `edgeProxyProviderKey` | Optional for public callers; required for event-driven internal calls when already resolved | Opaque edge proxy provider registry key. Public entrypoints normally resolve it from server proxy intent and provider registry. Disabled/no-proxy targets must not create a bootstrap attempt. |
| `attemptId` | Must be omitted by public repair callers; required for event-driven internal calls when already allocated | Idempotency key for the proxy bootstrap attempt. Public repair/retry allocates a new attempt id. Internal event-driven calls pass the already allocated attempt id. |
| `causationId` | Required when event-driven | Event id or command id that requested bootstrap. |
| `reason` | Optional | Safe operator/system reason such as `repair`, `retry`, `post-connect`, or `doctor-follow-up`. |

## Synchronous Admission

`servers.register` must synchronously validate:

- required input shape;
- provider key format and support at the application boundary;
- port validity;
- edge proxy mode/provider support;
- duplicate server registration policy.

`servers.connect` must synchronously validate:

- server id shape;
- server existence;
- required credential presence for provider policies that require credentials;
- idempotency key validity.

`servers.bootstrap-proxy` must synchronously validate:

- server existence;
- server is connected or otherwise operable enough for the selected runtime executor according to
  provider policy;
- edge proxy provider is required and registered;
- requested provider key matches the server proxy intent;
- duplicate attempt handling.

Admission failures return `err(DomainError)`.

## Server/Proxy Async Progression

Required progression:

```text
servers.register
  -> server registered
  -> servers.connect, process-manager initiated or explicitly requested
  -> server-connected
  -> proxy-bootstrap-requested, when edge proxy provider is required
  -> proxy-installed | proxy-install-failed
  -> server-ready, when connectivity and required proxy state are satisfied
```

For `edgeProxyMode = disabled`:

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

`servers.bootstrap-proxy` may be invoked by `appaloft server proxy repair <serverId>` as an
operator action after `server doctor` reports a proxy problem. The operation must not mutate user
workload containers. It may create, verify, replace, or restart only provider-owned proxy
infrastructure and provider-owned networks or volumes rendered by the selected edge proxy provider.

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
- if edge proxy is disabled, proxy status is `disabled` and no proxy bootstrap is required;
- if edge proxy is provider-backed, edge proxy status is `ready`;
- readiness is durably visible through the server read model.

Proxy bootstrap failure must not delete server metadata. It prevents readiness for proxy-backed deployments until a successful retry or explicit proxy disable/update.

## Idempotency Keys

Server/proxy-specific dedupe keys:

- registration: provider key + host + port, or a caller-supplied idempotency key when added;
- connect attempt: `serverId + attemptId`;
- proxy bootstrap attempt: `serverId + edgeProxyProviderKey + attemptId`;
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

## Tests

The governing matrix is [Server Bootstrap Test Matrix](../testing/server-bootstrap-test-matrix.md).

`servers.register` is a first-class operation. Its tests must be named and placed as server
registration tests, not only as setup inside deployment, proxy, or generic CLI/HTTP smoke suites.

Required first-class coverage:

- `SERVER-BOOT-CMD-001`, `SERVER-BOOT-CMD-002`, and `SERVER-BOOT-CMD-003`: application command
  boundary tests for accepted provider-backed metadata, accepted disabled-proxy metadata, and input
  rejection.
- `SERVER-BOOT-ENTRY-001`: CLI e2e chain for `appaloft server register` followed by `appaloft server
  list`.
- `SERVER-BOOT-ENTRY-002`: HTTP e2e chain for `POST /api/servers` followed by `GET /api/servers`.

Command admission, repository state, accepted-event publication, edge proxy state-machine details,
handler delegation, process-manager behavior, and retry/idempotency cases remain `integration` or
`unit` coverage unless a public read/query surface can observe the exact assertion. Do not require
an e2e test to prove hidden database fields or internal method calls.

## Current Implementation Notes And Migration Gaps

Current code has `servers.register`, `servers.configure-credential`, `servers.test-connectivity`,
`servers.test-draft-connectivity`, and public `servers.bootstrap-proxy` operation-catalog entries.
A concrete `servers.connect` lifecycle command is not yet implemented as an operation-catalog entry.

Current `servers.bootstrap-proxy` is exposed through CLI and HTTP/oRPC, allocates a new `pxy_*`
attempt id for public repair calls, publishes canonical `proxy-bootstrap-requested` plus terminal
`proxy-installed` or `proxy-install-failed` events, and executes the existing provider-backed proxy
bootstrapper synchronously during the command.

Current `servers.register` persists a `DeploymentTarget`, stores canonical target kind
`single-server` or `orchestrator-cluster`, and emits `deployment_target.registered`. When
`targetKind` is omitted, it defaults to `single-server`. When `proxyKind` is omitted, it defaults to
`traefik`.

Current proxy bootstrap is driven by `BootstrapServerEdgeProxyOnTargetRegisteredHandler`, which consumes `deployment_target.registered`. It marks edge proxy status `starting`, calls the runtime bootstrapper, then marks proxy `ready` or `failed`.

Current code still exposes `proxyKind` values as the provider-selection field. ADR-019 makes that a migration seam; the target contract uses provider mode and opaque provider keys.

Current connectivity testing returns a diagnostic `ServerConnectivityResult`; it does not promote a durable connected/server-ready lifecycle state.

Current `servers.test-connectivity` includes provider-rendered edge proxy diagnostics for local and
generic SSH targets when an edge proxy provider registry is available. Traefik diagnostics include
container image compatibility, Docker provider log scanning, and a bounded Docker-label route probe.
Failed provider-rendered edge proxy diagnostic checks include safe `repairCommand` metadata pointing
to `appaloft server proxy repair <serverId>`.

Current aggregate records `deployment_target.edge_proxy_bootstrap_started`, `deployment_target.edge_proxy_bootstrap_succeeded`, and `deployment_target.edge_proxy_bootstrap_failed`, but the current bootstrap event handler does not publish pulled events after marking started/succeeded/failed.

Current server state has persisted edge proxy fields, but no first-class persisted top-level server lifecycle status such as `registered`, `connected`, or `ready`.

The accepted operation key for explicit proxy repair/retry is `servers.bootstrap-proxy`. Human-facing CLI text may use `server proxy repair` because the action repairs provider-owned proxy infrastructure, but the business operation remains the lifecycle bootstrap command and must create a new attempt id.

## Open Questions

- Should duplicate registration return the existing server id or a `conflict` error?
