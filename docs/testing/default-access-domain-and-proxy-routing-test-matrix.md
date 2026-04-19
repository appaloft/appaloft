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
| DEF-ACCESS-ROUTE-004 | integration | Durable binding exists | Ready domain binding exists for same resource/path | Deployment accepted | None | Durable binding route takes precedence | Proxy config uses durable hostname | Per route realization |
| DEF-ACCESS-ROUTE-005 | integration | Provider unavailable before acceptance | Provider returns retriable error before deployment can safely be accepted | Command may reject when route is required by policy | Provider error with phase `default-access-domain-generation` | No generated route | No deployment when route is required | Yes |
| DEF-ACCESS-ROUTE-006 | integration | Provider disabled result | Provider returns no-route by policy | Deployment accepted without generated route when public route is optional | None or non-retriable policy result | No generated route | No proxy route unless durable binding exists | No |
| DEF-ACCESS-ROUTE-007 | integration | Missing target public address | Policy enabled but target has no usable public address | Reject or no-route according to policy requirement | `validation_error` or policy error, phase `default-access-policy-resolution` | No generated route | No proxy route | No until target configured |
| DEF-ACCESS-ROUTE-008 | integration | Proxy disabled or missing intent | Policy enabled, resource reverse-proxy, target has no proxy intent or proxy disabled | Deployment accepted without generated public URL | None | No generated route | No proxy route and no direct host-port fallback | No |
| DEF-ACCESS-ROUTE-009 | integration | Proxy not ready | Policy enabled, resource reverse-proxy, edge proxy failed/not ready | Reject or persist deployment failure according to detection phase | `proxy_not_ready` or proxy lifecycle error, phase `proxy-readiness` | No usable generated route | No direct host-port fallback | Depends |
| DEF-ACCESS-ROUTE-010 | integration | Resource has no internal port | Inbound app lacks `networkProfile.internalPort` | Command rejects | `validation_error`, phase `resource-network-resolution` | No generated route | No deployment | No |
| DEF-ACCESS-ROUTE-011 | integration | Direct-port exposure | Resource has `exposureMode = direct-port` and `hostPort` | Generated route resolver skipped | None | No generated reverse-proxy route | Direct-port behavior belongs to separate path | No |
| DEF-ACCESS-ROUTE-012 | integration | Worker/internal resource | Resource has `exposureMode = none` | Deployment accepted | None | No public route | No proxy route | No |
| DEF-ACCESS-ROUTE-013 | integration | Server-applied config domain exists | SSH CLI mode has valid server-applied config domain route for same resource/path | Deployment accepted | None | Server-applied custom route takes precedence over generated default route | Proxy config uses config hostname/path and does not create a managed `DomainBinding` | Per route realization |

## Pre-Deployment Read Model Matrix

| Test ID | Preferred automation | Case | Input/state | Expected result | Expected error | Expected route state | Expected UI/API behavior | Retriable |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DEF-ACCESS-QRY-001 | integration | Persisted resource before first deploy | Resource has `destinationId`, `internalPort`, reverse-proxy exposure, target public address, proxy intent, policy enabled | Resource query succeeds | None | `plannedGeneratedAccessRoute` is present; `latestGeneratedAccessRoute` is absent | Resource detail and Quick Deploy review/completion can display planned URL as not-ready | Query retry only |
| DEF-ACCESS-QRY-002 | integration | Persisted resource after deploy | Latest deployment snapshot contains generated route | Resource query succeeds | None | `latestGeneratedAccessRoute` is preferred over planned route | Resource detail and Quick Deploy completion link to realized URL | Query retry only |
| DEF-ACCESS-QRY-003 | integration | Repeated deployment same resource | Same resource, target, destination, and path policy deploys again | `deployments.create` accepted | None | Same generated hostname is preferred for the resource | New deployment snapshot records the route it used | Resource-scoped unless provider requires deployment scope |
| DEF-ACCESS-QRY-004 | integration | New resource draft not persisted | Entry workflow has source/network draft but no resource id | No resource access summary exists yet | None | No `ResourceAccessSummary` projection | Entry may show draft values but must not claim a realized route | No |
| DEF-ACCESS-QRY-005 | integration | Provider disabled before first deploy | Resource is persisted but provider returns disabled | Resource query succeeds | None | No planned generated route | UI shows no generated access URL and may point to domain binding workflow | No |

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
| DEF-ACCESS-ENTRY-006 | e2e-preferred | Policy configuration | Future Web/CLI/API policy editing dispatches `default-access-domain-policies.configure`; static config is not exposed as a hidden business operation. |

## Current Implementation Notes And Migration Gaps

Existing tests cover runtime-plan access routes, proxy bootstrap plans, Traefik/Caddy label generation, and public route health URL derivation.

Provider-neutral default access domain generation is covered by the concrete provider test.

Application route resolver enrichment is covered by a focused test that asserts provider-neutral metadata and no deployment command input widening.

Runtime adapter helper coverage now covers reverse-proxy deployments not creating direct public
host-port routes, reverse-proxy resources sharing the same `internalPort`, resource-scoped runtime
cleanup command construction, and direct-port exposure still creating direct routes.

`ResourceAccessSummary` projection has focused coverage for selecting the latest generated route
from deployment snapshots, exposing server-applied config domains separately from generated and
durable managed routes, and `resources.list` has focused coverage for exposing a planned generated
route before the first deployment.

Remaining gaps: policy-disabled behavior, provider injection through shell composition,
durable-domain precedence over generated routes, persistence-backed planned-route projection, a real
Docker/SSH same-`internalPort` e2e assertion, and an end-to-end Web/CLI assertion.

Web typecheck covers the resource detail and Quick Deploy generated URL surfaces, but there is not yet a browser/e2e assertion for those screens.

Full provider-rendered proxy configuration preview is not yet implemented and has no Web/API/CLI tests.

## Open Questions

- None for first e2e surface. Resource detail through `ResourceAccessSummary` is the canonical assertion target; Quick Deploy may also assert that it links to or refreshes the same projection.
