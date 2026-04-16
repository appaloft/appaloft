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

## Server Bootstrap Matrix

| Test ID | Preferred automation | Case | Input/state | Expected result | Expected event/state | Expected error | Retriable |
| --- | --- | --- | --- | --- | --- | --- | --- |
| EDGE-PROXY-SERVER-001 | integration | Proxy required and provider ready | Connected server with proxy intent | Ensure plan executed | `proxy-installed`; server can become ready | None | No |
| EDGE-PROXY-SERVER-002 | integration | Proxy provider unavailable | Connected server with unknown provider key | Bootstrap attempt fails | `proxy-install-failed`; server not ready for proxy-backed routes | `proxy_provider_unavailable` | Conditional |
| EDGE-PROXY-SERVER-003 | integration | Ensure plan execution fails | Provider plan generated, runtime executor fails | Bootstrap attempt fails | `proxy-install-failed` | `infra_error` or provider-mapped code, phase `proxy-bootstrap` | Yes |
| EDGE-PROXY-SERVER-004 | integration | Proxy not required | Proxy intent disabled | No provider plan | Server may become ready after connectivity | None | No |

## Route Realization Matrix

| Test ID | Preferred automation | Case | Input/state | Expected result | Expected proxy config | Expected state | Retriable |
| --- | --- | --- | --- | --- | --- | --- | --- |
| EDGE-PROXY-ROUTE-001 | integration | Generated access route | Resource has generated route snapshot | Route plan applied | Provider-specific route targets internal port | Deployment continues or succeeds | Per deployment |
| EDGE-PROXY-ROUTE-002 | integration | Durable domain route | Ready domain binding route exists | Route plan applied | Provider-specific route uses durable hostname/path | Deployment continues or succeeds | Per deployment |
| EDGE-PROXY-ROUTE-003 | integration | Duplicate route realization | Same deployment and route are realized again | Idempotent no duplicate | Same desired config | No duplicate route state | No |
| EDGE-PROXY-ROUTE-004 | integration | Route realization fails after acceptance | Runtime executor fails | Deployment failure/degraded route state | Config not marked applied | `deployment-failed` or degraded status | Yes |

## Proxy Configuration Query Matrix

| Test ID | Preferred automation | Case | Input | Expected result | Expected error | Expected sections |
| --- | --- | --- | --- | --- | --- | --- |
| EDGE-PROXY-QRY-001 | integration | Planned route before first deploy | `resourceId`, `routeScope = planned` | `ok`, status `planned` | None | Provider-rendered desired sections. |
| EDGE-PROXY-QRY-002 | integration | Latest realized route | `resourceId`, `routeScope = latest` | `ok`, status `applied` or `stale` | None | Snapshot/provider sections. |
| EDGE-PROXY-QRY-003 | integration | Deployment snapshot | `resourceId`, `deploymentId`, `routeScope = deployment-snapshot` | `ok` | None | Immutable snapshot-based sections. |
| EDGE-PROXY-QRY-004 | integration | No proxy route | Resource has no inbound route | `ok`, status `not-configured` | None | Empty sections. |
| EDGE-PROXY-QRY-005 | integration | Missing provider | Provider key unavailable | `err` | `proxy_provider_unavailable` | None. |
| EDGE-PROXY-QRY-006 | integration | Sensitive diagnostic values | Provider returns secrets in diagnostics | `ok` | None | Values redacted. |

## Entry Surface Matrix

| Test ID | Preferred automation | Entry | Required assertion |
| --- | --- | --- | --- |
| EDGE-PROXY-ENTRY-001 | e2e-preferred | Web resource detail | Shows read-only config sections from query output; does not generate labels/config locally. |
| EDGE-PROXY-ENTRY-002 | e2e-preferred | API/oRPC | Exposes the query schema and returns the same `ProxyConfigurationView`. |
| EDGE-PROXY-ENTRY-003 | e2e-preferred | CLI | Displays the query output or a clear provider-neutral summary from the query. |
| EDGE-PROXY-ENTRY-004 | e2e-preferred | Deployment progress | May link to route realization status but does not replace the configuration query. |
| EDGE-PROXY-ENTRY-005 | e2e-preferred | Resource access summary | Continues to show URL/status; full proxy config lives in the configuration query. |

## Current Implementation Notes And Migration Gaps

Existing runtime tests assert concrete proxy bootstrap plans and route labels. Those tests should move down into concrete provider package contract tests.

Provider package tests own concrete proxy label syntax. Runtime adapter tests should assert execution of provider-produced plans, not product-specific label generation.

Application and provider tests cover the query service, provider-rendered sections, and the guard
that generated default-access domain provider keys such as `sslip` do not override edge proxy
provider selection. Broader API/Web/CLI regression coverage remains a follow-up.

## Open Questions

- None for first provider and query coverage.
