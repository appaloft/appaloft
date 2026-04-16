# Edge Proxy Provider And Route Configuration Spec-Driven Test Matrix

## Normative Contract

Tests for edge proxy provider and route configuration must prove that proxy behavior is provider-backed, observable, and not hidden behind concrete runtime switches in application code.

## Global References

This test matrix inherits:

- [ADR-019: Edge Proxy Provider And Observable Configuration](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)
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

| Case | Input/state | Expected result | Expected error | Required assertion |
| --- | --- | --- | --- | --- |
| Provider resolves | Provider key registered | Provider returned | None | Application receives provider through registry/DI. |
| Provider missing | Provider key not registered | `err` | `proxy_provider_unavailable`, phase `proxy-provider-resolution` | No concrete fallback switch is used. |
| Provider renders ensure plan | Connected server requires proxy | Ensure plan returned | None | Plan includes only executable provider output, not aggregate mutations. |
| Provider ensure plan detects incompatible installed proxy | Target already has a provider-owned proxy container with an older or unsupported image | Ensure plan recreates the provider-owned proxy | None | Plan readiness guard includes the expected provider image so stale proxy containers are replaced. |
| Provider renders diagnostic plan | Existing target requests connectivity diagnostics for a provider-backed proxy | Diagnostic command plan returned | None | Plan includes provider-owned compatibility checks and any bounded route probe scripts; runtime executor, not command handler, runs them. |
| Provider renders route plan | Resource route targets `internalPort` | Route realization plan returned | None | Target port comes from resource network snapshot. |
| Provider renders config view | Planned or realized route exists | Read-only sections returned | None | Section content may be provider-specific; wrapper stays provider-neutral. |
| Provider render fails | Provider cannot render safe config | `err` | `proxy_configuration_render_failed` | Error contains code, phase, retriable, provider key. |

## Server Bootstrap Matrix

| Case | Input/state | Expected result | Expected event/state | Expected error | Retriable |
| --- | --- | --- | --- | --- | --- |
| Proxy required and provider ready | Connected server with proxy intent | Ensure plan executed | `proxy-installed`; server can become ready | None | No |
| Proxy provider unavailable | Connected server with unknown provider key | Bootstrap attempt fails | `proxy-install-failed`; server not ready for proxy-backed routes | `proxy_provider_unavailable` | Conditional |
| Ensure plan execution fails | Provider plan generated, runtime executor fails | Bootstrap attempt fails | `proxy-install-failed` | `infra_error` or provider-mapped code, phase `proxy-bootstrap` | Yes |
| Proxy not required | Proxy intent disabled | No provider plan | Server may become ready after connectivity | None | No |

## Route Realization Matrix

| Case | Input/state | Expected result | Expected proxy config | Expected state | Retriable |
| --- | --- | --- | --- | --- | --- |
| Generated access route | Resource has generated route snapshot | Route plan applied | Provider-specific route targets internal port | Deployment continues or succeeds | Per deployment |
| Durable domain route | Ready domain binding route exists | Route plan applied | Provider-specific route uses durable hostname/path | Deployment continues or succeeds | Per deployment |
| Duplicate route realization | Same deployment and route are realized again | Idempotent no duplicate | Same desired config | No duplicate route state | No |
| Route realization fails after acceptance | Runtime executor fails | Deployment failure/degraded route state | Config not marked applied | `deployment-failed` or degraded status | Yes |

## Proxy Configuration Query Matrix

| Case | Input | Expected result | Expected error | Expected sections |
| --- | --- | --- | --- | --- |
| Planned route before first deploy | `resourceId`, `routeScope = planned` | `ok`, status `planned` | None | Provider-rendered desired sections. |
| Latest realized route | `resourceId`, `routeScope = latest` | `ok`, status `applied` or `stale` | None | Snapshot/provider sections. |
| Deployment snapshot | `resourceId`, `deploymentId`, `routeScope = deployment-snapshot` | `ok` | None | Immutable snapshot-based sections. |
| No proxy route | Resource has no inbound route | `ok`, status `not-configured` | None | Empty sections. |
| Missing provider | Provider key unavailable | `err` | `proxy_provider_unavailable` | None. |
| Sensitive diagnostic values | Provider returns secrets in diagnostics | `ok` | None | Values redacted. |

## Entry Surface Matrix

| Entry | Required assertion |
| --- | --- |
| Web resource detail | Shows read-only config sections from query output; does not generate labels/config locally. |
| API/oRPC | Exposes the query schema and returns the same `ProxyConfigurationView`. |
| CLI | Displays the query output or a clear provider-neutral summary from the query. |
| Deployment progress | May link to route realization status but does not replace the configuration query. |
| Resource access summary | Continues to show URL/status; full proxy config lives in the configuration query. |

## Current Implementation Notes And Migration Gaps

Existing runtime tests assert concrete proxy bootstrap plans and route labels. Those tests should move down into concrete provider package contract tests.

Provider package tests own concrete proxy label syntax. Runtime adapter tests should assert execution of provider-produced plans, not product-specific label generation.

Application and provider tests cover the query service, provider-rendered sections, and the guard
that generated default-access domain provider keys such as `sslip` do not override edge proxy
provider selection. Broader API/Web/CLI regression coverage remains a follow-up.

## Open Questions

- None for first provider and query coverage.
