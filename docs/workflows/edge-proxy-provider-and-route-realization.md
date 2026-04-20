# Edge Proxy Provider And Route Realization Workflow Spec

## Normative Contract

Edge proxy provider and route realization is the internal workflow that turns provider-neutral route intent into provider-specific proxy infrastructure and route configuration.

The workflow is not a public command. It is used by server bootstrap, deployment route realization, generated access routing, durable domain routing, and proxy configuration queries.

```text
deployment target proxy intent
  -> resolve EdgeProxyProvider
  -> ensure shared proxy infrastructure
  -> render route realization plan
  -> runtime adapter executes provider-produced plan
  -> runtime adapter applies provider-produced reload plan when required
  -> capture route realization snapshot/read model
  -> expose provider-rendered read-only configuration view
```

## Global References

This workflow inherits:

- [ADR-019: Edge Proxy Provider And Observable Configuration](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-004: Server Readiness State Storage](../decisions/ADR-004-server-readiness-state-storage.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [ADR-024: Pure CLI SSH State And Server-Applied Domains](../decisions/ADR-024-pure-cli-ssh-state-and-server-applied-domains.md)
- [Default Access Domain And Proxy Routing Workflow](./default-access-domain-and-proxy-routing.md)
- [Server Bootstrap And Proxy Workflow](./server-bootstrap-and-proxy.md)
- [resources.proxy-configuration.preview Query Spec](../queries/resources.proxy-configuration.preview.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Workflow Position

This workflow owns provider coordination. It does not own aggregate invariants.

It consumes:

- deployment target/server proxy intent;
- deployment target public address and runtime access metadata;
- resource network profile;
- generated or durable access route snapshot;
- server-applied config domain route desired state in pure CLI/SSH mode, including canonical
  redirect aliases;
- deployment attempt id;
- provider registry configuration;
- execution context and correlation ids.

It produces:

- proxy ensure plans;
- route realization plans;
- proxy reload plans;
- provider-rendered configuration sections;
- progress/log events or deployment progress entries;
- route realization status in read models/snapshots.
- server-applied route applied/failed status for SSH-server Appaloft state.

## Provider Resolution

Provider resolution must be explicit:

```text
provider key or proxy intent
  -> EdgeProxyProviderRegistry
  -> EdgeProxyProvider
```

Provider keys are opaque. Application code may compare them only for registry lookup and audit/read-model display. It must not branch on provider-specific names to choose label syntax, image names, config file paths, or startup commands.

When no proxy is required, provider resolution returns a no-proxy result and the workflow must not create provider configuration.

## Server Bootstrap Relationship

Server bootstrap uses the same provider interface as deployment route realization.

```text
server-connected
  -> proxy-bootstrap-requested
  -> EdgeProxyProvider.ensureProxy
  -> runtime executor runs provider-produced ensure plan
  -> proxy-installed | proxy-install-failed
```

Explicit proxy repair uses the same provider ensure path:

```text
servers.bootstrap-proxy
  -> proxy-bootstrap-requested(new attemptId)
  -> EdgeProxyProvider.ensureProxy
  -> runtime executor verifies or repairs provider-owned proxy infrastructure
  -> proxy-installed | proxy-install-failed
```

The provider owns the proxy-specific ensure plan. Runtime execution owns how the plan is executed locally or over SSH.
Provider ensure plans may mutate only provider-owned proxy assets and must not mutate user workload
containers.

## Runtime Failure Classification

Runtime executors must translate expected proxy execution failures into stable Appaloft error codes
before persisting deployment/server state. Raw Docker, SSH, or process output remains deployment
log/runtime output; durable error state and read models must use the structured code and safe
metadata.

When a provider-produced proxy container command fails because the host port is already allocated
or the bind address is already in use, the runtime executor records:

- `errorCode = edge_proxy_host_port_conflict`
- `phase = proxy-container`
- `retriable = true`
- provider key, proxy kind, provider-owned container name, provider network name, and parsed host
  port/address when available

Consumers should use this code to offer targeted repairs such as freeing the existing listener,
adopting/importing an existing compatible edge proxy, or changing the configured edge proxy host
ports.

## Deployment Route Realization

For every accepted deployment attempt with reverse-proxy routes:

1. Resolve route snapshot from resource network profile, default access policy, durable domain
   bindings, server-applied config domain desired state, and deployment target state.
2. Resolve edge proxy provider.
3. Ask the provider to render a route realization plan.
4. Execute the provider-produced plan through the runtime adapter.
5. Apply the provider-produced reload plan when the provider requires one, or record that the
   provider's dynamic configuration watcher performs automatic reload.
6. Record progress and final route realization status.
7. Project the result into resource/deployment read models.

The provider must target `ResourceNetworkProfile.internalPort` or the immutable network snapshot derived from it. It must not read deployment command transport fields for port/domain/proxy/TLS behavior.

## Server-Applied Config Domains

In pure CLI/SSH mode, repository config `access.domains[]` is normalized into server-applied route
desired state before or during Quick Deploy execution. Edge proxy provider route realization owns
the concrete rendering and application of that desired state on the selected SSH target.

Deployment planning must read the selected server/destination/resource desired route state from the
SSH-server Appaloft state backend and translate it into the same provider-neutral route input used
by generated and durable domain routes. When first-run config bootstrap persisted route desired
state before an explicit destination id existed, the backend must fall back from the exact
destination-scoped key to the same project/environment/resource/server default-destination key.
Exact destination-scoped route state wins when both records exist. The desired state must not create
managed `DomainBinding` or `Certificate` aggregates in pure CLI mode.

The provider must treat server-applied config domains as provider-neutral route input:

- host, path prefix, TLS mode, optional `redirectTo` host, optional redirect status, resource
  network snapshot, server/destination context, and deployment/resource identity are supplied by the
  workflow;
- provider-specific files, labels, ACME storage, reload behavior, and diagnostics stay inside the
  provider/runtime adapter boundary;
- raw certificate material, DNS provider credentials, and target credentials are never accepted
  from repository config route input.

Canonical redirect route input must be rendered as redirect-only configuration for the source host.
It must not attach the redirect source host to the workload upstream. Providers must preserve path
and query by default, use the provider-neutral redirect status, and choose the target scheme from
the resolved target route TLS policy unless a future route-profile ADR adds an explicit scheme
field. Redirect source hosts still participate in TLS automation when `tlsMode = auto`, because a
browser must complete TLS negotiation before it can receive the redirect response. Provider-specific
implementations such as Traefik middleware or Caddy `redir` directives stay inside the concrete
provider package.

Server-applied route realization records applied/failed state in the selected Appaloft state
backend. It does not create managed `DomainBinding` or `Certificate` aggregates. In control-plane
mode, managed durable domain routes still flow through `domain-bindings.create` and the
routing/domain/TLS workflow before this edge proxy provider workflow realizes those routes.

## Server-Applied Route State Persistence

Server-applied route desired/applied state is application state in the selected Appaloft state
backend. It is not a `Resource` aggregate field, a managed `DomainBinding`, a `Certificate`, a
deployment command field, or committed repository config.

The application boundary must expose route state as operation-specific methods:

- `upsertDesired` for normalized desired route intent;
- `read` for deployment planning and diagnostics;
- `markApplied` for successful route realization;
- `markFailed` for route realization, proxy reload, or public verification failures.

Do not expose a generic route-state `update` operation. Each write has different domain meaning,
input, idempotency, and error semantics.

PostgreSQL/PGlite state backends persist server-applied route state in a dedicated table with this
canonical shape:

```text
server_applied_route_states
  route_set_id text primary key
  project_id text not null
  environment_id text not null
  resource_id text not null
  server_id text not null
  destination_id text null
  source_fingerprint text null
  domains json/jsonb not null
  status text not null
  updated_at timestamp/timestamptz not null
  last_applied json/jsonb null
  last_failure json/jsonb null
  metadata json/jsonb not null default '{}'
```

The persistence adapter must support:

- exact target lookup by project/environment/resource/server/destination;
- default-destination fallback lookup for first-run config bootstrap where `destination_id` is
  null;
- reverse lookup by `resource_id` for `resources.delete` blockers;
- server-scoped lookup for diagnostics, export/import, or control-plane adoption.

Exact destination-scoped route state wins when both exact and default-destination rows exist. The
default-destination row may be used only when no exact row exists for the resolved deployment
target.

The `domains` JSON stores only provider-neutral route intent: host, path prefix, TLS mode, optional
canonical redirect target host, and optional redirect status. Provider-specific files, labels,
ACME storage, reload commands, private keys, DNS provider credentials, target credentials, and raw
certificate material must stay outside the table.

The table must not cascade-delete resources. Any desired, applied, failed, or stale route state
referencing a resource is a `server-applied-route` deletion blocker until a future explicit cleanup
or unlink behavior removes that route state.

## Proxy Reload

Proxy reload is part of route realization, not a separate public command.

The provider must state the activation behavior in a provider-produced reload plan linked to route
realization:

| Reload mode | Meaning | Runtime obligation |
| --- | --- | --- |
| `automatic` | The provider watches the applied route/config state and activates it itself, for example through Docker label events or dynamic-provider polling. | Record the provider's success message; do not invent or execute a concrete reload command. |
| `command` | The provider requires an explicit command, API call, or script after configuration changes. | Execute the command step with the provided timeout, capture output, and fail route realization if it exits unsuccessfully. |

Reload applies after:

- workload route labels/configuration have been applied;
- durable domain route configuration changes;
- certificate-backed proxy configuration changes when the provider needs explicit activation.

Reload happens before public route verification and before a route is marked ready. A reload failure
is a route-realization failure with phase `proxy-reload` and must be observable through deployment
failure/degraded route state and logs.

Application, Web, CLI, and HTTP code must never build concrete reload commands. They may only
display provider-rendered reload sections or statuses from the query/read model.

## Observable Configuration

The provider must support rendering a read-only configuration view for:

- desired planned route state;
- latest realized route state;
- one deployment snapshot.

The configuration view may include provider-specific sections such as:

- container labels;
- config files;
- runtime commands;
- route manifests;
- health/diagnostic commands;
- warnings.

These sections are read-model output. They are not aggregate state and must not be accepted back as command input.

## Idempotency

Proxy ensure is idempotent by:

```text
serverId + providerKey + proxy role
```

Route realization is idempotent by:

```text
deploymentId + routeId + providerKey
```

Configuration preview is idempotent by:

```text
resourceId + routeScope + providerKey + route snapshot version
```

Retry must create a new attempt for mutating async work. It must not replay old fact events as if downstream work had not happened.

## Error Semantics

Canonical phases:

- `proxy-provider-resolution`;
- `proxy-ensure-plan-render`;
- `proxy-bootstrap`;
- `proxy-route-plan-render`;
- `proxy-route-realization`;
- `proxy-reload`;
- `proxy-configuration-render`;
- `proxy-diagnostics`;
- `public-route-verification`.

Provider errors must return structured `DomainError` values with category, phase, retriable flag, correlation id, causation id, and related server/resource/deployment ids.

Invalid redirect graph errors that are discovered before provider rendering use
`validation_error`, phase `config-domain-resolution`. Provider rendering failures for accepted
redirect input use the existing proxy phases, usually `proxy-route-plan-render` or
`proxy-route-realization`, and must include safe redirect source/target host metadata without
secrets.

Post-acceptance route realization failure must persist deployment failure or degraded route state. It must not rewrite the original accepted command result.

When the failed route belongs to one or more active durable domain bindings, a route realization
process manager must mark those bindings `not_ready` and publish
`domain-route-realization-failed` after the binding state is durable.

## User-Facing Surfaces

When the query is active, Web resource detail must expose read-only proxy configuration from `resources.proxy-configuration.preview`.

CLI and API must expose the same provider-neutral query result.

Provider-specific configuration must not be generated inside Web components, CLI commands, or HTTP route handlers.

## Current Implementation Notes And Migration Gaps

Runtime proxy bootstrap, route label generation, and proxy reload behavior now execute or observe
provider-produced plans instead of adapter-owned concrete proxy branches.

Server bootstrap resolves concrete edge proxy behavior through the injected provider registry and a runtime bootstrapper executor.

Deployment execution asks the provider registry for route realization plans, passes the generated
labels/network intent to runtime executors, and applies provider reload steps after route
configuration changes.

Durable domain binding route failure state is handled by a process manager that consumes failed
deployment/route facts and records affected bindings as `not_ready`.

Pure CLI SSH mode now reads server-applied config domain desired state from the selected
server/destination/resource state, groups entries by `pathPrefix` and `tlsMode`, and passes each
group into deployment planning and provider route realization input. Deployment-finished handling
records applied status after successful deployments and failed status for route realization, proxy
reload, and public route verification failures. Resource access, health, and diagnostic summaries
now expose the latest server-applied route URL/status separately from generated access and managed
durable domain routes. Provider-local TLS diagnostics for `tlsMode = auto` routes now identify the
resident edge proxy as the TLS automation owner and explicitly state that no Appaloft `Certificate`
aggregate is created by pure CLI server-applied routes.

Server-applied canonical redirect aliases now use the same provider route realization path, avoid
upstream attachment for redirect hosts, and expose redirect source/target/status in proxy
configuration and diagnostics. External public redirect probing, exact provider-native redirect
status verification, and provider-owned ACME history remain follow-up provider/e2e coverage.

The PostgreSQL/PGlite durable route-state slice is implemented through
[Server-Applied Route Durable Persistence Plan](../implementation/server-applied-route-durable-persistence-plan.md).
Shell command execution now uses the selected PostgreSQL/PGlite backend for server-applied route
desired/applied status, while file-backed SSH route-state storage remains available for
adapter-level transfer mechanics and explicit legacy wiring. PG `resources.delete` blocker reads
report `server-applied-route` blockers from durable route-state rows.

`resources.proxy-configuration.preview` exists for Web/API/CLI. Provider diagnostics now include
route-level provider-local TLS summaries, while real HTTPS public validation, provider-owned ACME
history, and long-running certificate renewal diagnostics remain future provider capabilities.

## Open Questions

- None for v1 provider boundary and read-only configuration visibility.
