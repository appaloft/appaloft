# Applied Route Context Lookup Baseline

## Status

- Round: Spec Round -> Test-First -> Code Round -> Post-Implementation Sync
- Artifact state: active
- Roadmap target: Phase 6 Access Policy, Domain/TLS Lifecycle, And Observability Hardening (`0.8.0` gate)
- Compatibility impact: `pre-1.0-policy`; additive internal read capability over existing
  `applied-route-context/v1` metadata with no new public operation

## Business Outcome

When a player cannot open generated access, a custom domain, a server-applied route, or a proxy
preview route, Appaloft should use copy-safe applied route metadata to explain which resource,
deployment, domain, server, destination, and route the failure belongs to.

Operators should be able to start from a request id, diagnostic id, route id, resource id,
deployment id, host, or path and receive provider-neutral route context without reading provider
raw payloads, SSH raw config, browser screenshots, raw Traefik labels, cookies, auth headers,
sensitive query strings, or remote logs.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Applied route context lookup | Internal read-only resolver that finds safe route context from `applied-route-context/v1` metadata or existing route read models. | Resource access observation | applied metadata lookup |
| Diagnostic id | Copy-safe stable id carried by `applied-route-context/v1` for support lookup and renderer context. | Diagnostics | route diagnostic id |
| Applied context source | The route source preserved from metadata: generated default, durable domain, server-applied, or deployment snapshot. | Access/proxy diagnostics | route source |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| APPLIED-ROUTE-CONTEXT-LOOKUP-SPEC-001 | Lookup by diagnostic id | Existing safe applied route metadata can be reconstructed from proxy preview/read-model route state | Lookup receives a diagnostic id | It returns found route context with safe ids, host, path prefix, source, status, proxy kind/provider, and timestamps when available. |
| APPLIED-ROUTE-CONTEXT-LOOKUP-SPEC-002 | Lookup by route/resource/deployment ids | Existing route read models expose route id, resource id, or deployment id context | Lookup receives one or more ids | Matching context is returned without expanding to unrelated route owners. |
| APPLIED-ROUTE-CONTEXT-LOOKUP-SPEC-003 | Evidence capture prefers applied lookup | Renderer receives safe `applied-route-context/v1` metadata and affected host/path | Evidence capture enriches the diagnostic | Applied metadata is resolved through the shared lookup core before hostname/path fallback. |
| APPLIED-ROUTE-CONTEXT-LOOKUP-SPEC-004 | Source preservation | Metadata comes from generated default, durable domain, server-applied, or deployment snapshot route | Lookup or evidence enrichment returns context | The original source is preserved and not rewritten to provider-native or generated-only language. |
| APPLIED-ROUTE-CONTEXT-LOOKUP-SPEC-005 | Redacted read-only output | Unsafe adjacent data is present near metadata, request, or provider output | Lookup, capture, renderer, or summary returns route context | Output contains only safe ids, host, path prefix, source, status, provider/proxy kind, and timestamps; no repair, redeploy, rollback, route mutation, or provider-native raw parsing occurs. |

## Domain Ownership

- Bounded context: Workload Delivery / Resource access observation with Runtime Topology route
  realization metadata.
- Aggregate/resource owner: none. Applied route context lookup is read-model/adapter metadata and
  not aggregate state.
- Upstream/downstream contexts: proxy preview, edge provider rendering, access-failure evidence,
  HTTP diagnostic renderer, companion/static renderer, resource health, and diagnostic summary.

## Public Surfaces

- API/oRPC: no new operation or schema. Existing resource access failure evidence lookup and proxy
  preview continue to carry safe route context where already exposed.
- CLI: no new command. Existing request-id lookup can return safer related ids when evidence was
  enriched.
- Web/UI: no lookup form and no Svelte-only route resolution logic.
- Config: not applicable.
- Events: not applicable.
- Public docs/help: existing diagnostics troubleshooting anchors remain sufficient because no new
  user workflow or help affordance is added.

## No ADR Needed

No new ADR is required. This slice implements ADR-017 generated access routing, ADR-019 observable
edge proxy configuration and access diagnostics, ADR-024 server-applied route state, ADR-029
observation boundaries, and ADR-030 docs/help closure. It does not change route ownership, durable
state shape, command/query boundaries, route/domain/TLS lifecycle, retention semantics, error
contracts, or recovery behavior.

## Non-Goals

- No real Traefik middleware e2e.
- No provider-native raw payload parsing.
- No route repair, redeploy, rollback, or mutation behavior.
- No Web lookup form.
- No new public operation, operation catalog row, transport schema, or route aggregate.

## Open Questions

- Should a later authenticated Web lookup form accept diagnostic id directly after ownership and
  visibility filtering rules are specified?
