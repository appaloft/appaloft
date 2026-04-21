# Edge Proxy Provider And Route Configuration Spec-Driven Test Matrix

## Normative Contract

Tests for edge proxy provider and route configuration must prove that proxy behavior is provider-backed, observable, and not hidden behind concrete runtime switches in application code.

## Global References

This test matrix inherits:

- [ADR-019: Edge Proxy Provider And Observable Configuration](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)
- [ADR-024: Pure CLI SSH State And Server-Applied Domains](../decisions/ADR-024-pure-cli-ssh-state-and-server-applied-domains.md)
- [Edge Proxy Provider And Route Realization Workflow](../workflows/edge-proxy-provider-and-route-realization.md)
- [resources.proxy-configuration.preview Query Spec](../queries/resources.proxy-configuration.preview.md)
- [Default Access Domain And Proxy Routing Test Matrix](./default-access-domain-and-proxy-routing-test-matrix.md)
- [Server Bootstrap Test Matrix](./server-bootstrap-test-matrix.md)
- [Spec-Driven Testing](./SPEC_DRIVEN_TESTING.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Test Layers

| Layer | Required focus |
| --- | --- |
| Provider contract | Concrete provider renders ensure plan, route plan, config view, logs/diagnostics from provider-neutral inputs. |
| Provider registry | Application resolves providers by key/capability and returns structured errors when missing. |
| Application boundary | Command/query/process code imports only provider-neutral ports, not concrete provider packages. |
| Server bootstrap | Proxy bootstrap consumes provider ensure plan and records ready/failed state. |
| Deployment route realization | Runtime execution consumes provider route plan and targets resource `internalPort`. |
| Server-applied config domains | Provider renders and applies route state from `access.domains[]` without creating managed `DomainBinding` records. |
| Server-applied route persistence | Selected PostgreSQL/PGlite backends persist desired/applied route state and expose reverse lookup for delete blockers. |
| Canonical redirects | Provider renders redirect-only route state from `redirectTo` aliases without attaching alias hosts to workload upstreams. |
| Proxy reload | Runtime applies provider-produced reload plans after route/certificate config changes and before public route verification. |
| Query/read model | `resources.proxy-configuration.preview` returns read-only planned/latest/snapshot config. |
| Web/API/CLI | Entry points display query output and do not reimplement provider rendering. |
| Migration guard | Concrete proxy product switches are not the authoritative route/bootstrap selection path after migration. |

## Given / When / Then Template

```md
Given:
- Registered edge proxy provider:
- Deployment target proxy intent:
- Resource network profile:
- Access route snapshot:
- Deployment snapshot:
- Provider behavior:

When:
- Server bootstrap, deployment route realization, or proxy configuration query runs.

Then:
- Provider calls:
- Runtime execution plan:
- Query output:
- Expected state:
- Expected error:
- Expected observability:
```

## Provider Boundary Matrix

| Test ID | Preferred automation | Case | Input/state | Expected result | Expected error | Required assertion |
| --- | --- | --- | --- | --- | --- | --- |
| EDGE-PROXY-PROVIDER-001 | contract | Provider resolves | Provider key registered | Provider returned | None | Application receives provider through registry/DI. |
| EDGE-PROXY-PROVIDER-002 | contract | Provider missing | Provider key not registered | `err` | `proxy_provider_unavailable`, phase `proxy-provider-resolution` | No concrete fallback switch is used. |
| EDGE-PROXY-PROVIDER-003 | contract | Provider renders ensure plan | Connected server requires proxy | Ensure plan returned | None | Plan includes only executable provider output, not aggregate mutations. |
| EDGE-PROXY-PROVIDER-004 | contract | Provider ensure plan detects incompatible installed proxy | Target already has a provider-owned proxy container with an older or unsupported image | Ensure plan recreates the provider-owned proxy | None | Plan readiness guard includes the expected provider image so stale proxy containers are replaced. |
| EDGE-PROXY-PROVIDER-005 | contract | Provider renders diagnostic plan | Existing target requests connectivity diagnostics for a provider-backed proxy | Diagnostic command plan returned | None | Plan includes provider-owned compatibility checks and any bounded route probe scripts; runtime executor, not command handler, runs them. |
| EDGE-PROXY-PROVIDER-006 | contract | Provider renders route plan | Resource route targets `internalPort` | Route realization plan returned | None | Target port comes from resource network snapshot. |
| EDGE-PROXY-PROVIDER-007 | contract | Provider renders config view | Planned or realized route exists | Read-only sections returned | None | Section content may be provider-specific; wrapper stays provider-neutral. |
| EDGE-PROXY-PROVIDER-008 | contract | Provider render fails | Provider cannot render safe config | `err` | `proxy_configuration_render_failed` | Error contains code, phase, retriable, provider key. |
| EDGE-PROXY-PROVIDER-009 | contract | Provider renders reload plan | Route realization changes provider-owned configuration | Reload plan returned | None | Plan uses `automatic` or provider-produced `command` reload steps; application code does not hardcode reload commands. |

## Server Bootstrap Matrix

| Test ID | Preferred automation | Case | Input/state | Expected result | Expected event/state | Expected error | Retriable |
| --- | --- | --- | --- | --- | --- | --- | --- |
| EDGE-PROXY-SERVER-001 | integration | Proxy required and provider ready | Connected server with proxy intent | Ensure plan executed | `proxy-installed`; server can become ready | None | No |
| EDGE-PROXY-SERVER-002 | integration | Proxy provider unavailable | Connected server with unknown provider key | Bootstrap attempt fails | `proxy-install-failed`; server not ready for proxy-backed routes | `proxy_provider_unavailable` | Conditional |
| EDGE-PROXY-SERVER-003 | integration | Ensure plan execution fails | Provider plan generated, runtime executor fails | Bootstrap attempt fails | `proxy-install-failed` | `infra_error` or provider-mapped code, phase `proxy-bootstrap` | Yes |
| EDGE-PROXY-SERVER-004 | integration | Proxy not required | Proxy intent disabled | No provider plan | Server may become ready after connectivity | None | No |

## Runtime Execution Matrix

| Test ID | Preferred automation | Case | Input/state | Expected result | Expected error | Required assertion |
| --- | --- | --- | --- | --- | --- | --- |
| EDGE-PROXY-RUNTIME-001 | unit | Docker host port conflict | Provider ensure command stderr contains Docker bind/port allocation failure | Failure is classified before persistence | `edge_proxy_host_port_conflict`, phase `proxy-container`, retriable | Parsed host port/address and provider-owned container/network metadata are preserved without relying on raw Docker text. |

## Route Realization Matrix

| Test ID | Preferred automation | Case | Input/state | Expected result | Expected proxy config | Expected state | Retriable |
| --- | --- | --- | --- | --- | --- | --- | --- |
| EDGE-PROXY-ROUTE-001 | integration | Generated access route | Resource has generated route snapshot | Route plan applied | Provider-specific route targets internal port | Deployment continues or succeeds | Per deployment |
| EDGE-PROXY-ROUTE-002 | integration | Durable domain route | Ready domain binding route exists | Route plan applied | Provider-specific route uses durable hostname/path | Deployment continues or succeeds | Per deployment |
| EDGE-PROXY-ROUTE-003 | integration | Duplicate route realization | Same deployment and route are realized again | Idempotent no duplicate | Same desired config | No duplicate route state | No |
| EDGE-PROXY-ROUTE-004 | integration | Route realization fails after acceptance | Runtime executor fails | Deployment failure/degraded route state | Config not marked applied | `deployment-failed` or degraded status | Yes |
| EDGE-PROXY-ROUTE-005 | integration | Server-applied config domain route | SSH-server remote state has `access.domains[]` desired route for a deployed resource | Provider route plan receives config domain route input and applies when supported | Provider-specific route uses config hostname/path and resource internal port | Desired state is consumed without creating managed `DomainBinding`; successful deployment records applied status in server-applied route state | Per route realization |
| EDGE-PROXY-ROUTE-006 | integration | Server-applied TLS auto delegated to provider | Config domain has `tlsMode = auto` and provider supports resident TLS automation | Provider renders TLS-enabled route/config without requiring raw cert material from config | Provider-specific ACME/storage details stay inside provider output | Proxy configuration and resource diagnostic summaries expose provider-local TLS status/diagnostics without creating managed `Certificate` state | Per provider policy |
| EDGE-PROXY-ROUTE-007 | integration | Server-applied route realization failure | Provider cannot render, apply, reload, or verify config domain route | Route realization fails with structured error | Config not marked applied | Remote state/read model exposes failed route with `proxy-domain-realization` or provider phase | Yes when provider marks retriable |
| EDGE-PROXY-ROUTE-008 | integration | Server-applied canonical redirect | Provider receives a served canonical host plus alias host with `redirectTo` and `redirectStatus` | Provider route plan renders redirect-only configuration for the alias host and upstream proxy configuration for the canonical host | Provider-specific redirect rule preserves path/query and uses the requested status; alias host is not attached to workload upstream | Successful deployment records applied redirect route status and proxy configuration view exposes source host, target host, and status | Per route realization |

## Proxy Reload Matrix

| Test ID | Preferred automation | Case | Input/state | Expected result | Expected state | Retriable |
| --- | --- | --- | --- | --- | --- | --- |
| EDGE-PROXY-RELOAD-001 | contract | Automatic provider reload | Provider watches Docker labels or dynamic config | Provider reload plan declares `automatic` reload | Runtime records reload/activation observability and does not execute a concrete reload command | No |
| EDGE-PROXY-RELOAD-002 | integration | Command provider reload succeeds | Provider route plan includes a command reload step | Runtime executes the provider command after applying route config | Route realization continues to public verification/success | No |
| EDGE-PROXY-RELOAD-003 | integration | Command provider reload fails | Provider reload command exits non-zero | Deployment or route realization is failed/degraded with phase `proxy-reload` | Route is not marked ready | Yes when provider marks failure retryable |
| EDGE-PROXY-RELOAD-004 | integration | Certificate-backed route activation | Certificate-backed route config changes after `certificate-issued` | Provider reload is applied before `domain-ready` or public route readiness | Domain route is not marked ready until reload/activation succeeds | Conditional |

## Proxy Configuration Query Matrix

| Test ID | Preferred automation | Case | Input | Expected result | Expected error | Expected sections |
| --- | --- | --- | --- | --- | --- | --- |
| EDGE-PROXY-QRY-001 | integration | Planned route before first deploy | `resourceId`, `routeScope = planned` | `ok`, status `planned` | None | Provider-rendered desired sections. |
| EDGE-PROXY-QRY-002 | integration | Latest current route | `resourceId`, `routeScope = latest`, with durable/server-applied/generated route state available | `ok`, status `applied`, `stale`, or `planned` | None | Provider sections render the selected current route using durable, server-applied, latest generated, then planned generated precedence; immutable deployment snapshot remains available through `deployment-snapshot`. |
| EDGE-PROXY-QRY-003 | integration | Deployment snapshot | `resourceId`, `deploymentId`, `routeScope = deployment-snapshot` | `ok` | None | Immutable snapshot-based sections. |
| EDGE-PROXY-QRY-004 | integration | No proxy route | Resource has no inbound route | `ok`, status `not-configured` | None | Empty sections. |
| EDGE-PROXY-QRY-005 | integration | Missing provider | Provider key unavailable | `err` | `proxy_provider_unavailable` | None. |
| EDGE-PROXY-QRY-006 | integration | Sensitive diagnostic values | Provider returns secrets in diagnostics | `ok` | None | Values redacted. |
| EDGE-PROXY-QRY-007 | integration | Canonical redirect visible | Latest or planned route state contains an alias redirect | `ok`, status `planned` or `applied` | None | Route view includes `routeBehavior = redirect`, `redirectTo`, and `redirectStatus`; provider-specific redirect syntax appears only in read-only sections. |

## Entry Surface Matrix

| Test ID | Preferred automation | Entry | Required assertion |
| --- | --- | --- | --- |
| EDGE-PROXY-ENTRY-001 | e2e-preferred | Web resource detail | Shows read-only config sections from query output; does not generate labels/config locally. |
| EDGE-PROXY-ENTRY-002 | e2e-preferred | API/oRPC | Exposes the query schema and returns the same `ProxyConfigurationView`. |
| EDGE-PROXY-ENTRY-003 | e2e-preferred | CLI | Displays the query output or a clear provider-neutral summary from the query. |
| EDGE-PROXY-ENTRY-004 | e2e-preferred | Deployment progress | May link to route realization status but does not replace the configuration query. |
| EDGE-PROXY-ENTRY-005 | e2e-preferred | Resource access summary | Continues to show URL/status; full proxy config lives in the configuration query. |

## Server-Applied Route Persistence Matrix

| Test ID | Preferred automation | Case | Input/state | Expected result | Expected error | Required assertion |
| --- | --- | --- | --- | --- | --- | --- |
| SERVER-APPLIED-ROUTE-STATE-001 | integration | PG desired route upsert/read | Selected PostgreSQL/PGlite backend, trusted project/environment/resource/server target, served host, and redirect alias | Desired state is durable and readable with provider-neutral domains, target ids, status, and updated timestamp | None | Store writes through an application-level `upsertDesired` operation and does not require the CLI file store. |
| SERVER-APPLIED-ROUTE-STATE-002 | integration | Exact destination wins over default fallback | Default-destination row exists, then exact destination row exists for the same resource/server | Exact destination read returns the exact row; fallback row is used only when no exact row exists | None | Lookup order is exact target first, default-destination second. |
| SERVER-APPLIED-ROUTE-STATE-003 | integration | Applied/failed status writeback | Desired row exists and route realization succeeds or fails; one write uses a mismatched target/route-set id | Applied/failed safe metadata is persisted; mismatched write is rejected | `server_applied_route_state_conflict`, phase `proxy-route-realization` | `markApplied` and `markFailed` are separate writes and do not overwrite another route set. |
| SERVER-APPLIED-ROUTE-STATE-004 | integration | Delete blocker from route state | Archived resource has a row in `server_applied_route_states` | `resources.delete` rejects before tombstone and reports `server-applied-route` | `resource_delete_blocked`, phase `resource-deletion-guard` | Blocker comes from PG route-state reverse lookup by `resource_id`; no route state is cascaded away. |
| SERVER-APPLIED-ROUTE-STATE-005 | integration | Migration shape supports durable lookups | PG/PGlite migrations are applied | Table and indexes support exact lookup, fallback lookup, resource reverse lookup, and server diagnostics | None | Schema has no unsafe cascade from resource deletion to route state. |

## Current Implementation Notes And Migration Gaps

Existing runtime tests assert concrete proxy bootstrap plans and route labels. Those tests should move down into concrete provider package contract tests.

Provider package tests own concrete proxy label syntax. Runtime adapter tests should assert execution of provider-produced plans, not product-specific label generation.

Application and provider tests cover the query service, provider-rendered sections, provider-owned
reload plans, and the guard
that generated default-access domain provider keys such as `sslip` do not override edge proxy
provider selection. Broader API/Web/CLI regression coverage remains a follow-up.

`EDGE-PROXY-ROUTE-005` now has application/runtime coverage for consuming SSH-server
server-applied config domain desired state as provider-neutral route input and recording applied
status after a successful deployment. The current slice supports multiple path/TLS route groups by
expanding config domains into distinct provider-neutral access routes. Resource access, health, and
diagnostic summary tests cover observable server-applied route URL/status.

`EDGE-PROXY-ROUTE-007` now has application/store coverage for structured failed status persistence
when deployment failure is in route realization, reload, or public-route verification phases.

`EDGE-PROXY-ROUTE-006` now has provider coverage for Traefik and Caddy TLS-auto route rendering
and application diagnostic coverage for surfacing provider-local TLS summaries through resource
diagnostics. Real HTTPS public validation and provider-owned ACME history remain follow-up work.

`EDGE-PROXY-ROUTE-008` and `EDGE-PROXY-QRY-007` now have provider route input, Traefik/Caddy
renderer, runtime planning, and proxy configuration query coverage for canonical redirect aliases.
External runtime reload and public redirect probing remain e2e follow-up coverage.

`SERVER-APPLIED-ROUTE-STATE-001` through `SERVER-APPLIED-ROUTE-STATE-005` have PG/PGlite
integration coverage in `packages/persistence/pg/test/pglite.integration.test.ts`.

## Open Questions

- None for first provider and query coverage.
