# Default Access Domain And Proxy Routing Spec-Driven Test Matrix

## Normative Contract

Tests for generated default access and proxy routing must prove that default public URLs are resolved from resource/server/policy state and realized by runtime adapters without adding domain/proxy/TLS fields back to `deployments.create`.

## Global References

This test matrix inherits:

- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-019: Edge Proxy Provider And Observable Configuration](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)
- [Default Access Domain And Proxy Routing Workflow Spec](../workflows/default-access-domain-and-proxy-routing.md)
- [Edge Proxy Provider And Route Realization Workflow Spec](../workflows/edge-proxy-provider-and-route-realization.md)
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
| Route resolver | Durable domain bindings take precedence over generated routes; disabled policy yields no route. |
| Deployment admission/planning | `deployments.create` remains ids-only and resolves route snapshots from state. |
| Runtime adapter | Executes provider-produced proxy plans that target `networkProfile.internalPort` and do not require public host-port exposure. |
| Edge proxy provider | Provider contract renders proxy ensure plan, route realization plan, and read-only configuration view. |
| Server/proxy workflow | Proxy readiness gates generated reverse-proxy routes. |
| Resource access read model/UI/CLI | Planned and realized generated URLs plus route status are observable through `ResourceAccessSummary`; full provider-rendered proxy config is observable through `resources.proxy-configuration.preview`. |

## Given / When / Then Template

```md
Given:
- Resource network profile:
- Deployment target public address:
- Edge proxy status:
- Default access domain policy:
- Durable domain bindings:
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

| Case | Input/state | Expected result | Expected error | Expected route snapshot | Expected runtime behavior | Retriable |
| --- | --- | --- | --- | --- | --- | --- |
| Generated route enabled | Resource has `internalPort`, target has public address, proxy ready, policy enabled | `deployments.create` accepted | None | Generated hostname with opaque provider key | Proxy route config targets `internalPort` | Per deployment |
| Policy disabled | Resource has `internalPort`, proxy ready, policy disabled | Deployment accepted without generated public URL | None | No generated route | No proxy route unless durable binding exists | No |
| Durable binding exists | Ready domain binding exists for same resource/path | Deployment accepted | None | Durable binding route takes precedence | Proxy config uses durable hostname | Per route realization |
| Provider unavailable before acceptance | Provider returns retriable error before deployment can safely be accepted | Command may reject when route is required by policy | Provider error with phase `default-access-domain-generation` | No generated route | No deployment when route is required | Yes |
| Provider disabled result | Provider returns no-route by policy | Deployment accepted without generated route when public route is optional | None or non-retriable policy result | No generated route | No proxy route unless durable binding exists | No |
| Missing target public address | Policy enabled but target has no usable public address | Reject or no-route according to policy requirement | `validation_error` or policy error, phase `default-access-policy-resolution` | No generated route | No proxy route | No until target configured |
| Proxy disabled or missing intent | Policy enabled, resource reverse-proxy, target has no proxy intent or proxy disabled | Deployment accepted without generated public URL | None | No generated route | No proxy route and no direct host-port fallback | No |
| Proxy not ready | Policy enabled, resource reverse-proxy, edge proxy failed/not ready | Reject or persist deployment failure according to detection phase | `proxy_not_ready` or proxy lifecycle error, phase `proxy-readiness` | No usable generated route | No direct host-port fallback | Depends |
| Resource has no internal port | Inbound app lacks `networkProfile.internalPort` | Command rejects | `validation_error`, phase `resource-network-resolution` | No generated route | No deployment | No |
| Direct-port exposure | Resource has `exposureMode = direct-port` and `hostPort` | Generated route resolver skipped | None | No generated reverse-proxy route | Direct-port behavior belongs to separate path | No |
| Worker/internal resource | Resource has `exposureMode = none` | Deployment accepted | None | No public route | No proxy route | No |

## Pre-Deployment Read Model Matrix

| Case | Input/state | Expected result | Expected error | Expected route state | Expected UI/API behavior | Retriable |
| --- | --- | --- | --- | --- | --- | --- |
| Persisted resource before first deploy | Resource has `destinationId`, `internalPort`, reverse-proxy exposure, target public address, proxy intent, policy enabled | Resource query succeeds | None | `plannedGeneratedAccessRoute` is present; `latestGeneratedAccessRoute` is absent | Resource detail and Quick Deploy review/completion can display planned URL as not-ready | Query retry only |
| Persisted resource after deploy | Latest deployment snapshot contains generated route | Resource query succeeds | None | `latestGeneratedAccessRoute` is preferred over planned route | Resource detail and Quick Deploy completion link to realized URL | Query retry only |
| New resource draft not persisted | Entry workflow has source/network draft but no resource id | No resource access summary exists yet | None | No `ResourceAccessSummary` projection | Entry may show draft values but must not claim a realized route | No |
| Provider disabled before first deploy | Resource is persisted but provider returns disabled | Resource query succeeds | None | No planned generated route | UI shows no generated access URL and may point to domain binding workflow | No |

## Provider Boundary Matrix

| Case | Expected assertion |
| --- | --- |
| Concrete generated-domain provider registered | Composition root injects a generic generated-domain provider port; application code imports no concrete generated-domain provider module. |
| Provider-specific suffix | Suffix appears only in provider adapter/config/log output, not in core/application enum names, command schemas, or error codes. |
| Generated hostname includes uniqueness | Provider output is unique enough for the resource/deployment purpose and stable for the persisted snapshot. |
| Duplicate deployment replay | Replaying the same accepted attempt uses the persisted route snapshot and does not generate a different hostname. |
| Provider failure mapping | Provider errors map to structured `DomainError` with code, category, phase, retriable, and correlation ids. |
| Provider package boundary | Concrete generated-domain providers live under `packages/providers/default-access-domain-*` and are registered through DI. |

## Edge Proxy Provider Matrix

| Case | Expected assertion |
| --- | --- |
| Concrete edge proxy provider registered | Composition root injects an `EdgeProxyProvider` or registry; application code imports no concrete edge proxy provider module. |
| Provider-specific config syntax | Labels, files, route manifests, and commands appear only in provider output, not in command schemas or aggregate state. |
| Route plan render | Provider route plan targets resource `internalPort` and generated/durable hostnames from route snapshots. |
| Configuration preview | `resources.proxy-configuration.preview` returns provider-rendered read-only sections and redacts sensitive data. |
| Provider failure mapping | Edge proxy provider errors map to structured `DomainError` with code, category, phase, retriable, provider key, and correlation ids. |
| Provider package boundary | Concrete edge proxy providers live under `packages/providers/edge-proxy-*` and are registered through DI. |

## Runtime Proxy Matrix

| Case | Expected assertion |
| --- | --- |
| Reverse-proxy route | Workload joins the proxy routing fabric or equivalent runtime network. |
| Upstream target | Proxy config targets resolved `internalPort`, not a deployment command `port`. |
| Public host port | Application container does not require stable public `0.0.0.0:<internalPort>` publication when reverse proxy is used. |
| Proxy install idempotency | Runtime adapter can ensure proxy/network more than once without duplicating containers/routes. |
| Route config idempotency | Re-running route realization for the same deployment does not create duplicate proxy route definitions. |
| Public route verification | Verification uses generated/durable public URL only after route config is realized. |

## Entry Surface Matrix

| Entry | Expected behavior |
| --- | --- |
| Web Quick Deploy | Shows generated URL after `ResourceAccessSummary` is available, including planned route for a persisted resource before first deployment and realized route after deployment; does not ask user to enter provider-specific generated-domain settings. |
| Resource detail | Displays generated access URL separately from durable domain bindings and, when active, displays read-only proxy configuration from `resources.proxy-configuration.preview`. |
| CLI deploy | Prints generated URL or route status after resource access read-model observation when available; a resource-scoped proxy-config query prints provider-rendered sections when active. |
| API | Returns/queries provider-neutral route metadata; strict deployment create input remains ids-only; proxy configuration preview is a read-only query. |
| Domain binding UI | Keeps custom domain creation separate from generated default access. |
| Policy configuration | Future Web/CLI/API policy editing dispatches `default-access-domain-policies.configure`; static config is not exposed as a hidden business operation. |

## Current Implementation Notes And Migration Gaps

Existing tests cover runtime-plan access routes, proxy bootstrap plans, Traefik/Caddy label generation, and public route health URL derivation.

Provider-neutral default access domain generation is covered by the concrete provider test.

Application route resolver enrichment is covered by a focused test that asserts provider-neutral metadata and no deployment command input widening.

Runtime adapter planning now has focused coverage for reverse-proxy deployments not creating direct public host-port routes, and direct-port exposure still creating direct routes.

`ResourceAccessSummary` projection has focused coverage for selecting the latest generated route from deployment snapshots, and `resources.list` has focused coverage for exposing a planned generated route before the first deployment.

Remaining gaps: policy-disabled behavior, provider injection through shell composition, durable-domain precedence over generated routes, persistence-backed planned-route projection, and an end-to-end Web/CLI assertion.

Web typecheck covers the resource detail and Quick Deploy generated URL surfaces, but there is not yet a browser/e2e assertion for those screens.

Full provider-rendered proxy configuration preview is not yet implemented and has no Web/API/CLI tests.

## Open Questions

- None for first e2e surface. Resource detail through `ResourceAccessSummary` is the canonical assertion target; Quick Deploy may also assert that it links to or refreshes the same projection.
