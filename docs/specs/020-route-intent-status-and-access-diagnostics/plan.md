# Plan: Route Intent/Status And Access Diagnostics

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: ADR-012, ADR-014, ADR-015, ADR-017, ADR-018, ADR-019, ADR-021, ADR-023,
  ADR-024, ADR-025, ADR-029, ADR-030, ADR-031
- Operation map: `docs/BUSINESS_OPERATION_MAP.md`
- Operation catalog: `docs/CORE_OPERATIONS.md`, `packages/application/src/operation-catalog.ts`
- Global contracts: `docs/errors/model.md`, `docs/errors/neverthrow-conventions.md`,
  `docs/architecture/async-lifecycle-and-acceptance.md`
- Local specs: default access routing, edge proxy route realization, runtime target abstraction,
  resource runtime logs, deployment detail, resource health, resource diagnostic summary, resource
  access failure diagnostics, and the resource access/proxy/health/log/diagnostic query specs
- Related feature artifact: `docs/specs/019-zero-to-ssh-supported-catalog-acceptance-harness`
- Test matrices: default access/proxy, edge proxy provider/route configuration, resource access
  failure diagnostics, resource health, resource runtime logs, resource diagnostic summary

## ADR Need Decision

No new ADR is required for this behavior.

- ADR-017 already defines generated access route precedence and `ResourceAccessSummary`.
- ADR-019 already defines provider-neutral edge proxy, observable configuration, and access failure
  diagnostics.
- ADR-018 and ADR-020 already place runtime logs and health as resource-owned observation.
- ADR-023 already requires future Swarm/Kubernetes backends to normalize logs, health, proxy, and
  diagnostics without changing deployment admission.
- ADR-024 already defines server-applied route desired/applied state as separate from managed
  `DomainBinding` and `Certificate` lifecycles.
- ADR-029 keeps deployment observation read-only and recovery write commands gated.

A new or updated ADR is required only if Appaloft introduces a dedicated public route mutation
surface, a new route aggregate, new command boundaries for route repair, or changes durable
DomainBinding/Certificate lifecycle ownership.

## Architecture Approach

- Domain/application placement: add a provider-neutral route intent/status descriptor at the
  application/contract read-model boundary. Use core value objects only if write-side domain state
  needs stable route identity/status in a later Code Round.
- Read-model impact: enrich existing resource access summaries and composed health/diagnostic/proxy
  sections with descriptor-compatible fields where required. Keep route descriptors copy-safe.
- Edge proxy/provider impact: fake provider/runtime fixtures render/apply/read back route status
  through the existing edge proxy provider contract. Real proxy/DNS/TLS/SSH remains opt-in smoke.
- CQRS impact: no new command/query in this slice. Existing queries remain read-only and must not
  mutate route, proxy, health, or deployment state.
- Entrypoint impact: API/oRPC, CLI, and Web consume shared schemas. Web helper code may select
  display routes only from the shared route precedence fields; it must not define a parallel
  business contract.
- Persistence impact: no migration expected for the first slice. If route descriptors later need a
  retained read model, that must be a separate spec or ADR-gated Code Round.
- Error/diagnostic impact: unavailable/unsupported observation becomes typed section state or
  source error. It is not a deployment failure unless the deployment workflow itself failed.

## Roadmap And Compatibility

- Roadmap target: Phase 6 `0.8.0`.
- Version target: `0.8.0` only when Phase 6 required items and exit criteria are checked.
- Compatibility impact: additive hardening under `pre-1.0-policy`; no new deployment command and no
  expansion of `deployments.create`.
- Release-note input: generated access, durable domain, server-applied route, proxy preview,
  health, logs, and diagnostic copy now share a route/access observation contract. Real
  DNS/TLS/Traefik/SSH smoke remains opt-in.

## Testing Strategy

- Stable matrix ids:
  - `ROUTE-INTENT-001` through `ROUTE-INTENT-004`
  - `ROUTE-STATUS-001` through `ROUTE-STATUS-004`
  - `ACCESS-DIAG-001` through `ACCESS-DIAG-004`
  - `PROXY-OBS-001` through `PROXY-OBS-003`
  - `HEALTH-ACCESS-001` through `HEALTH-ACCESS-003`
  - `WEB-CLI-API-ACCESS-001` through `WEB-CLI-API-ACCESS-003`
- Hermetic default tests:
  - route descriptor construction from generated, durable, server-applied, and deployment snapshot
    route inputs;
  - route precedence selection across access summary, proxy preview, health, and diagnostics;
  - fake proxy render/apply/readback status composition;
  - access failure diagnostic mapping into health and diagnostic summary source errors;
  - copy-safe redaction assertions;
  - Web/API/CLI schema parity assertions where existing entrypoint test helpers are available.
- Opt-in smoke:
  - real Traefik error middleware probing;
  - real DNS/TLS and certificate-provider checks;
  - real generic-SSH route apply/readback;
  - local Docker end-to-end public route verification.

## Risks And Migration Gaps

- Existing access summary uses separate generated/durable/server-applied fields. This slice should
  preserve them for compatibility while adding descriptor-compatible route intent/status instead of
  replacing every consumer at once.
- Existing access failure diagnostics do not persist every edge request envelope. Health/diagnostic
  composition can use safe known envelopes when available and otherwise report
  `observation_unavailable`.
- A dedicated public route list/repair query may become useful, but this slice deliberately keeps
  the route contract embedded in existing observation surfaces until specs prove a separate
  operation is needed.

## Current Implementation Notes

- `packages/application/src/operations/resources/route-intent-status.ts` composes
  `RouteIntentStatusDescriptor` values from `ResourceAccessSummary` and selected durable binding
  state.
- `ResourcePublicAccessHealthSection` now carries `routeIntentStatus` when a public route or
  blocking durable route can be selected.
- `ResourceDiagnosticAccess` now carries `selectedRoute` and `routeIntentStatuses` so diagnostic
  copy, health, and proxy preview can explain the same selected/context routes.
- `packages/contracts/src/index.ts` exposes the same route intent/status schema for API/oRPC, CLI,
  Web, and future tool surfaces.
- No persistence migration was added; the descriptor is composed from existing read-model state.
- Existing fake provider/query fixtures were sufficient for the hermetic route preview and
  deployment-snapshot acceptance coverage.
- Real DNS/TLS/Traefik/SSH smoke remains opt-in and out of the default acceptance harness.
