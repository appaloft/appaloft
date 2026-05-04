# Real Traefik Access Failure Middleware E2E Baseline

## Status

- Round: Spec Round -> Test-First -> Code Round -> Post-Implementation Sync
- Artifact state: active
- Roadmap target: Phase 6 Access Policy, Domain/TLS Lifecycle, And Observability Hardening (`0.8.0` gate)
- Compatibility impact: `pre-1.0-policy`; additive provider/runtime verification over existing
  `resource-access-failure/v1`, `applied-route-context/v1`, and request-id evidence lookup

## Business Outcome

When a player opens a generated access URL, custom domain, server-applied route, or provider
preview route and the real Traefik edge cannot reach the upstream route, Appaloft should return a
safe access failure diagnostic instead of leaving the operator with a raw proxy page or screenshot.

The diagnostic must carry a request id and, when Appaloft supplied safe applied route context to
the route, enough safe route/resource/deployment/domain/server/destination context for existing
evidence lookup, resource health, diagnostic summary, proxy preview, CLI, HTTP renderer, and static
renderer surfaces to explain ownership without provider-native raw payloads.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Real Traefik access failure middleware | A real Traefik `errors` middleware path that rewrites gateway-generated 404/502/503/504 failures to the Appaloft access failure renderer. | Edge proxy provider | Traefik error middleware |
| Middleware e2e baseline | Opt-in Docker/Traefik end-to-end proof that the provider-rendered labels work against a real Traefik container. | Verification | real edge smoke |
| Safe route diagnostic query | Provider-rendered renderer request parameters derived only from `applied-route-context/v1` and safe request/status facts. | Diagnostics | route context query |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| REAL-TRAEFIK-ACCESS-SPEC-001 | Real Traefik served-route upstream failure | Traefik runs with an Appaloft-rendered served route, safe renderer target, and safe applied route context | The route matches a request but the upstream target returns a gateway-generated 502/503/504 class failure | Traefik invokes the Appaloft renderer and returns a `resource-access-failure/v1` diagnostic with the request id, stable code/phase/status, affected host/path, and safe route context. |
| REAL-TRAEFIK-ACCESS-SPEC-002 | Request-id evidence lookup after real edge capture | The renderer captured the real Traefik diagnostic into short-retention evidence | An operator looks up the request id through the existing lookup surface | The lookup returns the same safe envelope and related ids without raw Traefik labels, provider logs, headers, cookies, sensitive query strings, SSH credentials, or route mutation. |
| REAL-TRAEFIK-ACCESS-SPEC-003 | Real edge route-not-found fallback remains safe | Traefik runs with the provider-rendered low-priority route-not-found fallback and a safe renderer target | No served or redirect router matches the request host/path | The fallback invokes the renderer with `resource_access_route_not_found` and safe affected request data, while ACME challenge paths remain excluded. |

## Domain Ownership

- Bounded context: Workload Delivery / Resource access observation with Runtime Topology provider
  realization.
- Aggregate/resource owner: none. This is adapter/read-model observation, not aggregate state.
- Upstream/downstream contexts: Traefik provider rendering, local/SSH runtime route realization,
  HTTP diagnostic renderer, short-retention evidence lookup, automatic/applied route context
  lookup, resource health, diagnostic summary, and static renderer.

## Public Surfaces

- API/oRPC: no new operation or schema. Existing `GET /api/resource-access-failures/{requestId}`
  keeps returning the existing lookup contract when evidence was captured.
- CLI: no new command. Existing `appaloft resource access-failure <requestId>` can read captured
  evidence.
- Web/UI: no Web lookup form and no Svelte-only route resolution.
- Config: no new config key. Existing `APPALOFT_RESOURCE_ACCESS_FAILURE_RENDERER_URL` remains the
  explicit topology override when a CLI/runtime process needs a reachable backend renderer URL.
- Events: not applicable.
- Public docs/help: existing diagnostics troubleshooting anchors remain sufficient because the user
  workflow and lookup affordance are unchanged.

## No ADR Needed

No new ADR is required. This slice implements the existing ADR-019 access failure diagnostic
middleware behavior using a real Traefik e2e and reuses ADR-017 generated access routing,
ADR-024 server-applied route state, ADR-029 observation boundaries, and ADR-030 docs/help closure.
It does not change route ownership, command/query boundaries, public schemas, durable state shape,
edge lifecycle ownership, evidence retention semantics, error contracts, or recovery behavior.

## Non-Goals

- No Web lookup form.
- No route repair, redeploy, rollback, or dependency resource mutation.
- No provider-native raw metadata parsing.
- No new public lookup schema, operation catalog row, route aggregate, or transport-only input.
- No DNS, TLS certificate issuance, SSH remote-state smoke, or external provider smoke.

## Open Questions

- Should a later provider-native metadata slice support richer real Traefik context when the
  failure did not originate from Appaloft-rendered safe metadata?
