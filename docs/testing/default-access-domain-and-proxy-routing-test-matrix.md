# Default Access Domain And Proxy Routing Spec-Driven Test Matrix

## Normative Contract

Tests for generated default access and proxy routing must prove that default public URLs are
resolved from resource/server/policy state and realized by runtime adapters without adding
domain/proxy/TLS fields back to `deployments.create`.

Generated default access must also yield to explicit custom routes, including managed durable
domain bindings and pure CLI/SSH server-applied config domain routes.

## Global References

This test matrix inherits:

- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-019: Edge Proxy Provider And Observable Configuration](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)
- [ADR-024: Pure CLI SSH State And Server-Applied Domains](../decisions/ADR-024-pure-cli-ssh-state-and-server-applied-domains.md)
- [Default Access Domain And Proxy Routing Workflow Spec](../workflows/default-access-domain-and-proxy-routing.md)
- [Edge Proxy Provider And Route Realization Workflow Spec](../workflows/edge-proxy-provider-and-route-realization.md)
- [Resource Access Failure Diagnostics Test Matrix](./resource-access-failure-diagnostics-test-matrix.md)
- [resources.proxy-configuration.preview Query Spec](../queries/resources.proxy-configuration.preview.md)
- [default-access-domain-policies.configure Command Spec](../commands/default-access-domain-policies.configure.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [Server Bootstrap And Proxy Workflow Spec](../workflows/server-bootstrap-and-proxy.md)
- [deployments.create Test Matrix](./deployments.create-test-matrix.md)
- [routing-domain-and-tls Test Matrix](./routing-domain-and-tls-test-matrix.md)
- [Spec-Driven Testing](./SPEC_DRIVEN_TESTING.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Test Layers

| Layer | Default access/proxy routing focus |
| --- | --- |
| Provider adapter contract | Concrete provider implementation generates a valid hostname from provider-neutral input and never leaks provider-specific types into core/application. |
| Policy command | Future `default-access-domain-policies.configure` validates scope/mode/provider and persists provider-neutral policy state without route side effects. |
| Application port boundary | Application uses a generic provider port and handles `Result` errors by code/phase. |
| Route resolver | Durable domain bindings and server-applied config routes take precedence over generated routes; disabled policy yields no route. |
| Deployment admission/planning | `deployments.create` remains ids-only and resolves route snapshots from state. |
| Runtime adapter | Executes provider-produced proxy plans that target `networkProfile.internalPort` and do not require public host-port exposure. |
| Edge proxy provider | Provider contract renders proxy ensure plan, route realization plan, and read-only configuration view. |
| Server/proxy workflow | Proxy readiness gates generated reverse-proxy routes. |
| Resource access read model/UI/CLI | Planned and realized generated URLs plus route status are observable through `ResourceAccessSummary`; full provider-rendered proxy config is observable through `resources.proxy-configuration.preview`. |
| Edge request diagnostics | Gateway-generated failures after route exposure are classified by `resource_access_*` diagnostics and do not add fields to `deployments.create`. |

## Given / When / Then Template

```md
Given:
- Resource network profile:
- Deployment target public address:
- Edge proxy status:
- Default access domain policy:
- Durable domain bindings:
- Server-applied config domain routes:
- Provider adapter behavior:
- Runtime adapter behavior:

When:
- Dispatch deployments.create or resolve a route snapshot.

Then:
- Command result:
- Provider port calls:
- Generated route snapshot:
- Runtime proxy configuration:
- Deployment/resource access read-model status:
- Expected errors:
- Events/progress:
```

## Route Resolution Matrix

| Test ID | Preferred automation | Case | Input/state | Expected result | Expected error | Expected route snapshot | Expected runtime behavior | Retriable |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DEF-ACCESS-ROUTE-001 | integration | Generated route enabled | Resource has `internalPort`, target has public address, proxy ready, policy enabled | `deployments.create` accepted | None | Generated hostname with opaque provider key | Proxy route config targets `internalPort` | Resource-scoped unless provider requires deployment scope |
| DEF-ACCESS-ROUTE-002 | integration | Same internal port across resources | Two reverse-proxy resources on the same target both use `internalPort = 3000` | Both deployment attempts can succeed when routes are distinct | None | Each resource has its own generated or durable route snapshot | Runtime/proxy config isolates routes by resource/deployment identity and does not stop the first resource | Per route realization |
| DEF-ACCESS-ROUTE-003 | integration | Policy disabled | Resource has `internalPort`, proxy ready, policy disabled | Deployment accepted without generated public URL | None | No generated route | No proxy route unless durable binding exists | No |
| DEF-ACCESS-ROUTE-004 | integration | Durable binding exists | Ready domain binding exists for same resource/path while server-applied config domain and generated policy are also available | Deployment accepted | None | Durable binding route takes precedence over server-applied and generated routes | Proxy config uses durable hostname/path and provider-neutral route metadata records durable binding source | Per route realization |
| DEF-ACCESS-ROUTE-005 | integration | Provider unavailable before acceptance | Provider returns retriable error before deployment can safely be accepted | Command may reject when route is required by policy | Provider error with phase `default-access-domain-generation` | No generated route | No deployment when route is required | Yes |
| DEF-ACCESS-ROUTE-006 | integration | Provider disabled result | Provider returns no-route by policy | Deployment accepted without generated route when public route is optional | None or non-retriable policy result | No generated route | No proxy route unless durable binding exists | No |
| DEF-ACCESS-ROUTE-007 | integration | Missing target public address | Policy enabled but target has no usable public address | Reject or no-route according to policy requirement | `validation_error` or policy error, phase `default-access-policy-resolution` | No generated route | No proxy route | No until target configured |
| DEF-ACCESS-ROUTE-008 | integration | Proxy disabled or missing intent | Policy enabled, resource reverse-proxy, target has no proxy intent or proxy disabled | Deployment accepted without generated public URL | None | No generated route | No proxy route and no direct host-port fallback | No |
| DMBH-TARGET-001 | unit + integration | Target-owned proxy route eligibility | Deployment target edge proxy is missing, disabled, or provider-backed | Generated-route callers ask the target for route proxy selection | None | Same generated-route/no-route decision as before | Runtime behavior unchanged; only behavior placement changes | No |
| DEF-ACCESS-ROUTE-009 | integration | Proxy not ready | Policy enabled, resource reverse-proxy, edge proxy failed/not ready | Reject or persist deployment failure according to detection phase | `proxy_not_ready` or proxy lifecycle error, phase `proxy-readiness` | No usable generated route | No direct host-port fallback | Depends |
| DEF-ACCESS-ROUTE-010 | integration | Resource has no internal port | Inbound app lacks `networkProfile.internalPort` | Command rejects | `validation_error`, phase `resource-network-resolution` | No generated route | No deployment | No |
| DEF-ACCESS-ROUTE-011 | integration | Direct-port exposure | Resource has `exposureMode = direct-port` and `hostPort` | Generated route resolver skipped | None | No generated reverse-proxy route | Direct-port behavior belongs to separate path | No |
| DEF-ACCESS-ROUTE-012 | integration | Worker/internal resource | Resource has `exposureMode = none` | Deployment accepted | None | No public route | No proxy route | No |
| DEF-ACCESS-ROUTE-013 | integration | Server-applied config domain exists | SSH CLI mode has valid server-applied config domain route for same resource/path, no ready or explicitly deployable durable binding exists, and generated policy is enabled | Deployment accepted | None | Server-applied custom route takes precedence over generated default route | Proxy config uses config hostname/path and does not create a managed `DomainBinding` | Per route realization |

## Policy Command Matrix

| Test ID | Preferred automation | Case | Input/state | Expected result | Expected error | Expected route state | Expected UI/API behavior | Retriable |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DEF-ACCESS-POLICY-001 | integration | System policy persisted | Configure system scope with supported provider mode | Command succeeds and persists provider-neutral system policy | None | Future route resolution reads system policy when no target override exists | CLI/API/Web can submit the command and receive `{ id }` | No |
| DEF-ACCESS-POLICY-002 | integration | Deployment-target override persisted | Configure deployment-target scope for an existing server | Command succeeds and persists target override | None | Future route resolution reads target override before system/static fallback | Server detail Web form, CLI, and API dispatch the same command payload | No |
| DEF-ACCESS-POLICY-003 | integration | Idempotent retry | Same scope and same payload are retried with the same idempotency key | Command succeeds and returns the existing policy id | None | No route side effect | Client can safely retry without duplicate records | No |
| DEF-ACCESS-POLICY-004 | integration | Idempotency conflict | Same scope is retried with the same idempotency key but different payload | Command rejects | `default_access_policy_conflict` | No route side effect | Client receives conflict without hidden overwrite | No |
| DEF-ACCESS-POLICY-005 | integration | Unsupported provider | Provider mode references an unregistered/unavailable provider key or unsupported custom-template mode | Command rejects | `default_access_provider_unavailable` | No route side effect | Client receives provider-resolution failure with no hidden fallback write | Conditional |
| DEF-ACCESS-POLICY-006 | integration | Missing deployment target | Deployment-target scope references a server that does not exist | Command rejects | `not_found` | No route side effect | No policy row is created | No |
| DEF-ACCESS-POLICY-007 | integration | Durable persistence round-trip | System and deployment-target policy rows are stored in PG/PGlite and read back after migration | Store round-trip succeeds | None | Resolver/runtime can consume durable policy after restart | CLI/API/Web writes survive restart through the selected state backend | Query retry only |
| DEF-ACCESS-POLICY-008 | integration | Show system policy | Persisted system policy exists | Query succeeds | None | No route state mutation | CLI/API/Web read back provider-neutral policy fields | Query retry only |
| DEF-ACCESS-POLICY-009 | integration | Show deployment-target override | Persisted override exists for an existing server | Query succeeds after server scope resolution | None | No route state mutation | Server detail can prefill override fields from durable state | Query retry only |
| DEF-ACCESS-POLICY-010 | integration | Missing durable policy readback | Requested scope has no persisted policy | Query succeeds with `policy = null` | None | Static fallback is not fabricated as durable state | Entrypoints keep explicit defaults or inherited labels without claiming a saved policy | Query retry only |
| DEF-ACCESS-POLICY-011 | integration | List persisted policies | System and deployment-target policy rows exist | Query succeeds with all persisted rows | None | No route state mutation | CLI/API can inspect durable system and server overrides together | Query retry only |

## Pre-Deployment Read Model Matrix

| Test ID | Preferred automation | Case | Input/state | Expected result | Expected error | Expected route state | Expected UI/API behavior | Retriable |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DEF-ACCESS-QRY-001 | integration | Persisted resource before first deploy | Resource has `destinationId`, `internalPort`, reverse-proxy exposure, target public address, proxy intent, policy enabled | Resource query succeeds | None | `plannedGeneratedAccessRoute` is present; `latestGeneratedAccessRoute` is absent | Resource detail and Quick Deploy review/completion can display planned URL as not-ready | Query retry only |
| DEF-ACCESS-QRY-002 | integration | Persisted resource after deploy | Latest deployment snapshot contains route state and access summary may include durable, server-applied, generated, and planned routes | Resource query succeeds | None | Separate fields remain visible, and current-route consumers select durable ready, server-applied, latest generated, then planned generated | Resource detail, Quick Deploy completion, health, diagnostics, and proxy preview use the same selected-route precedence while still labeling route source | Query retry only |
| DEF-ACCESS-QRY-003 | integration | Repeated deployment same resource | Same resource, target, destination, and path policy deploys again | `deployments.create` accepted | None | Same generated hostname is preferred for the resource | New deployment snapshot records the route it used | Resource-scoped unless provider requires deployment scope |
| DEF-ACCESS-QRY-004 | integration | New resource draft not persisted | Entry workflow has source/network draft but no resource id | No resource access summary exists yet | None | No `ResourceAccessSummary` projection | Entry may show draft values but must not claim a realized route | No |
| DEF-ACCESS-QRY-005 | integration | Provider disabled before first deploy | Resource is persisted but provider returns disabled | Resource query succeeds | None | No planned generated route | UI shows no generated access URL and may point to domain binding workflow | No |

## Route Intent Descriptor Matrix

These rows are governed by
[Route Intent/Status And Access Diagnostics](../specs/020-route-intent-status-and-access-diagnostics/spec.md).

| Test ID | Preferred automation | Case | Input/state | Expected descriptor/selection | Required assertion |
| --- | --- | --- | --- | --- | --- |
| ROUTE-INTENT-001 | integration | Generated access route descriptor | Planned or latest generated access route exists | Descriptor source is `generated-default-access`; route remains context when a higher-precedence route exists | Generated route is visible but not treated as a durable domain binding. |
| ROUTE-INTENT-002 | integration | Durable route descriptor wins | Ready durable, server-applied, and generated routes all exist | Selected route source is `durable-domain-binding` | Durable route wins current-route precedence across access summary consumers. |
| ROUTE-INTENT-003 | integration | Server-applied route descriptor wins | Server-applied and generated routes exist, with no selected durable route | Selected route source is `server-applied-route` | Server-applied route wins over generated access without creating managed domain/certificate state. |
| ROUTE-INTENT-004 | integration | Deployment snapshot route is historical | Caller requests deployment snapshot route scope | Descriptor source is `deployment-snapshot-route` and selected-current route remains resource-owned | Historical snapshot route does not overwrite current resource access. |

## Route Status Diagnostic Matrix

| Test ID | Preferred automation | Case | Input/state | Expected status | Required assertion |
| --- | --- | --- | --- | --- | --- |
| ROUTE-STATUS-001 | integration | Proxy route unavailable | Proxy route is missing, stale, not-ready, or failed | Descriptor status is typed as unavailable/stale/failed with `proxy_route_missing` or `proxy_route_stale` | State is read-model diagnostic, not deployment admission failure unless execution itself failed. |
| ROUTE-STATUS-002 | integration | Non-ready durable route blocks access | Durable domain binding is pending/not ready and fallback routes exist | Selected descriptor has durable source and blocking reason `domain_not_verified` or owning durable-domain reason | Fallback routes stay context and do not hide the durable route. |
| ROUTE-STATUS-003 | integration | TLS/certificate route status draft | Route needs certificate coverage but certificate is missing, expired, or inactive | Descriptor TLS state is `missing`, `expired`, `pending`, or `failed` with a stable blocking reason | Future certificate lifecycle can consume the same read contract without changing route precedence. |
| ROUTE-STATUS-004 | integration | Observation unavailable | Provider/runtime/access observation cannot be read safely | Descriptor/source error uses `observation_unavailable` | Whole query still succeeds when safe route/resource context is available. |

## Provider Boundary Matrix

| Test ID | Preferred automation | Case | Expected assertion |
| --- | --- | --- | --- |
| DEF-ACCESS-PROVIDER-001 | contract | Concrete generated-domain provider registered | Composition root injects a generic generated-domain provider port; application code imports no concrete generated-domain provider module. |
| DEF-ACCESS-PROVIDER-002 | contract | Provider-specific suffix | Suffix appears only in provider adapter/config/log output, not in core/application enum names, command schemas, or error codes. |
| DEF-ACCESS-PROVIDER-003 | contract | Generated hostname includes uniqueness | Provider output is unique enough for the resource/deployment purpose and stable for the persisted snapshot. |
| DEF-ACCESS-PROVIDER-004 | contract | Duplicate deployment replay | Replaying the same accepted attempt uses the persisted route snapshot and does not generate a different hostname. |
| DEF-ACCESS-PROVIDER-005 | contract | Stable resource hostname | Repeated deployments of the same resource keep the same generated hostname unless resource, target, destination, path policy, or provider scope policy changes. |
| DEF-ACCESS-PROVIDER-006 | contract | Provider failure mapping | Provider errors map to structured `DomainError` with code, category, phase, retriable, and correlation ids. |
| DEF-ACCESS-PROVIDER-007 | contract | Provider package boundary | Concrete generated-domain providers live under `packages/providers/default-access-domain-*` and are registered through DI. |

## Edge Proxy Provider Matrix

| Test ID | Preferred automation | Case | Expected assertion |
| --- | --- | --- | --- |
| DEF-ACCESS-EDGE-001 | contract | Concrete edge proxy provider registered | Composition root injects an `EdgeProxyProvider` or registry; application code imports no concrete edge proxy provider module. |
| DEF-ACCESS-EDGE-002 | contract | Provider-specific config syntax | Labels, files, route manifests, and commands appear only in provider output, not in command schemas or aggregate state. |
| DEF-ACCESS-EDGE-003 | contract | Route plan render | Provider route plan targets resource `internalPort` and generated/durable hostnames from route snapshots. |
| DEF-ACCESS-EDGE-004 | contract | Configuration preview | `resources.proxy-configuration.preview` returns provider-rendered read-only sections and redacts sensitive data. |
| DEF-ACCESS-EDGE-005 | contract | Provider failure mapping | Edge proxy provider errors map to structured `DomainError` with code, category, phase, retriable, provider key, and correlation ids. |
| DEF-ACCESS-EDGE-006 | contract | Provider package boundary | Concrete edge proxy providers live under `packages/providers/edge-proxy-*` and are registered through DI. |

## Runtime Proxy Matrix

| Test ID | Preferred automation | Case | Expected assertion |
| --- | --- | --- | --- |
| DEF-ACCESS-RUNTIME-001 | integration | Reverse-proxy route | Workload joins the proxy routing fabric or equivalent runtime network. |
| DEF-ACCESS-RUNTIME-002 | integration | Upstream target | Proxy config targets resolved `internalPort`, not a deployment command `port`. |
| DEF-ACCESS-RUNTIME-003 | integration | Public host port | Application container does not require stable public `0.0.0.0:<internalPort>` publication when reverse proxy is used. |
| DEF-ACCESS-RUNTIME-004 | integration | Private health port | Runtime may use a loopback-only or runtime-local ephemeral host port for health checks, and tests must treat it as diagnostic metadata rather than a public route. |
| DEF-ACCESS-RUNTIME-005 | integration | Same internal port isolation | Deploying another resource with the same `internalPort` does not remove, replace, or hijack the first resource's runtime instance or proxy route. |
| DEF-ACCESS-RUNTIME-006 | integration | Same resource replacement | A new terminal deployment attempt for the same resource may replace the previous runtime instance only after the replacement route has passed required verification, without affecting other resources on the same `internalPort`. |
| DEF-ACCESS-RUNTIME-007 | integration | Direct-port collision | A direct-port host-port conflict fails or rejects the conflicting deployment and preserves the resource that already owns the host port. |
| DEF-ACCESS-RUNTIME-008 | integration | Proxy install idempotency | Runtime adapter can ensure proxy/network more than once without duplicating containers/routes. |
| DEF-ACCESS-RUNTIME-009 | integration | Route config idempotency | Re-running route realization for the same deployment does not create duplicate proxy route definitions. |
| DEF-ACCESS-RUNTIME-010 | integration | Public route verification | Verification uses generated/durable public URL only after route config is realized. |
| DEF-ACCESS-RUNTIME-011 | integration | Public route failure preserves previous route | When a replacement candidate fails generated/durable public route verification, the failed candidate is cleaned up or isolated and the previous successful same-resource route remains active. |

## Entry Surface Matrix

| Test ID | Preferred automation | Entry | Expected behavior |
| --- | --- | --- | --- |
| DEF-ACCESS-ENTRY-001 | e2e-preferred | Web Quick Deploy | Shows generated URL after `ResourceAccessSummary` is available, including planned route for a persisted resource before first deployment and realized route after deployment; does not ask user to enter provider-specific generated-domain settings. |
| DEF-ACCESS-ENTRY-002 | e2e-preferred | Resource detail | Displays generated access URL separately from durable domain bindings and, when active, displays read-only proxy configuration from `resources.proxy-configuration.preview`. |
| DEF-ACCESS-ENTRY-003 | e2e-preferred | CLI deploy | Prints generated URL or route status after resource access read-model observation when available; a resource-scoped proxy-config query prints provider-rendered sections when active. |
| DEF-ACCESS-ENTRY-004 | e2e-preferred | API | Returns/queries provider-neutral route metadata; strict deployment create input remains ids-only; proxy configuration preview is a read-only query. |
| DEF-ACCESS-ENTRY-005 | e2e-preferred | Domain binding UI | Keeps custom domain creation separate from generated default access. |
| DEF-ACCESS-ENTRY-006 | e2e-preferred | Policy configuration | Web/CLI/API policy editing dispatches `default-access-domain-policies.configure`; static config is only fallback state, not a hidden public business operation. |
| DEF-ACCESS-ENTRY-007 | e2e-preferred | Policy readback | Web/CLI/API policy readback dispatches `default-access-domain-policies.show` or `default-access-domain-policies.list`; Web policy forms prefill from persisted policy state and refetch readback after save. |
| DEF-ACCESS-ENTRY-008 | e2e-preferred | Web current access route | Resource detail and Quick Deploy completion select the current access URL from `ResourceAccessSummary` using durable ready domain, server-applied config domain, latest generated, then planned generated precedence. |

## Current Implementation Notes And Migration Gaps

Existing tests cover runtime-plan access routes, proxy bootstrap plans, Traefik/Caddy label generation, and public route health URL derivation.

`DMBH-TARGET-001` adds focused domain behavior coverage for target-owned route proxy eligibility
while preserving existing `DEF-ACCESS-ROUTE-001` and `DEF-ACCESS-ROUTE-008` observable behavior.
The row is implemented by `packages/core/test/deployment-target.test.ts` and covered through the
deployment create and deployment plan preview regression tests.

Provider-neutral default access domain generation is covered by the concrete provider test.

Application route resolver enrichment is covered by a focused test that asserts provider-neutral metadata and no deployment command input widening.

Runtime adapter helper coverage now covers reverse-proxy deployments not creating direct public
host-port routes, reverse-proxy resources sharing the same `internalPort`, resource-scoped runtime
cleanup command construction, and direct-port exposure still creating direct routes.

`ResourceAccessSummary` projection has focused coverage for selecting the latest generated route
from deployment snapshots, exposing server-applied config domains separately from generated and
durable managed routes, and `resources.list` has focused coverage for exposing a planned generated
route before the first deployment.

Remaining gaps: policy-disabled observation across broader UI copy, durable-domain/server-applied
precedence in broader CLI/API regression suites, persistence-backed planned-route projection beyond
focused tests, a real Docker/SSH same-`internalPort` e2e assertion, and richer Web assertion
coverage outside the current access URL selector.

Web typecheck covers the resource detail and Quick Deploy generated URL surfaces, and resource
detail keeps generated access visually separate from durable and server-applied domain routes while
exposing provider-rendered proxy configuration. `DEF-ACCESS-ENTRY-008` covers the Web current access
URL selector so resource detail and Quick Deploy do not prefer generated access when a durable or
server-applied route exists.

`resources.proxy-configuration.preview` is active and renders provider-owned read-only
configuration sections through the edge proxy provider boundary. Application/provider tests cover
the query-service path, provider-rendered sections, generated-access provider-key guard, and the
default-access policy command and readback paths; broader API/Web/CLI regression coverage for
route precedence remains follow-up.

## Open Questions

- None for first e2e surface. Resource detail through `ResourceAccessSummary` is the canonical assertion target; Quick Deploy may also assert that it links to or refreshes the same projection.
