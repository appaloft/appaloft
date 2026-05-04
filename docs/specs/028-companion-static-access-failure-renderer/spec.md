# Companion/Static Access Failure Renderer Baseline

## Status

- Round: Spec Round -> Test-First -> Code Round -> Post-Implementation Sync
- Artifact state: active
- Roadmap target: Phase 6 Access Policy, Domain/TLS Lifecycle, And Observability Hardening (`0.8.0` gate)
- Compatibility impact: `pre-1.0-policy`; additive provider-neutral renderer asset and shared rendering helpers, with no new public operation

## Business Outcome

When a player opens a generated access URL, custom domain, server-applied route, or proxy preview
route and the request fails, Appaloft should still show a safe Appaloft diagnostic envelope even
when no long-running Appaloft backend service is reachable from the edge proxy.

This slice establishes a provider-neutral companion/static renderer baseline for one-shot CLI,
remote SSH, and adapter-owned static runtime paths. It reuses the existing
`resource-access-failure/v1` envelope, `applied-route-context/v1` metadata, automatic route context
lookup where a backend renderer is available, and the safe failure sanitizer from the failure
visibility baseline. It does not add real Traefik middleware e2e, a Web lookup form, route repair,
redeploy, rollback, or provider-native raw metadata parsing.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Companion/static renderer | Provider-neutral static HTML renderer that can display a safe access failure diagnostic without calling a reachable Appaloft backend service. | Resource access observation | static access failure renderer |
| Static renderer artifact | Packaged static asset served by an adapter-owned static runtime or future companion service. | Runtime packaging | diagnostic renderer asset |
| Diagnostic rendering model | Copy-safe display model derived from a sanitized `resource-access-failure/v1` envelope. | Application rendering | renderer view model |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| COMPANION-STATIC-ACCESS-FAILURE-SPEC-001 | Render safe diagnostic without backend | A sanitized `resource-access-failure/v1` envelope is available to a static renderer | The renderer builds HTML without a backend call | The page shows request id, code, category, phase, retriable flag, next action, generated time, and safe affected request fields. |
| COMPANION-STATIC-ACCESS-FAILURE-SPEC-002 | Preserve applied route context | The envelope carries route context from `applied-route-context/v1` | The renderer builds copyable route context | The page preserves diagnostic id, resource/deployment/domain/server/destination/route ids, route source/status, host, path prefix, and provider key when safe. |
| COMPANION-STATIC-ACCESS-FAILURE-SPEC-003 | Static path packages renderer | A static-site runtime is packaged by Appaloft | The adapter-owned static server Docker build is generated | The build includes a static renderer asset under `/.appaloft/resource-access-failure` and does not require a running backend renderer URL. |
| COMPANION-STATIC-ACCESS-FAILURE-SPEC-004 | Unsafe adjacent data is excluded | Provider raw payloads, SSH credentials, private keys, auth headers, cookies, sensitive query values, or raw remote logs are adjacent to the failure | The static renderer or backend renderer receives diagnostic input | The rendered HTML and static asset include only sanitized envelope fields and do not echo unsafe adjacent data. |
| COMPANION-STATIC-ACCESS-FAILURE-SPEC-005 | Rendering is read-only | A renderer displays next action guidance | The player or operator reads/copies the diagnostic | No repair, redeploy, rollback, route mutation, provider lookup, or Appaloft state mutation is triggered. |

## Domain Ownership

- Bounded context: Workload Delivery / Resource access observation with Runtime Topology packaging.
- Aggregate/resource owner: none. Rendering is read-model/adapter output over an already sanitized
  diagnostic envelope, not aggregate state.
- Upstream/downstream contexts: edge proxy providers, static runtime packaging, access failure
  evidence capture, automatic route context lookup, resource health, diagnostic summary, and proxy
  preview.

## Public Surfaces

- API/oRPC: no new route or schema. Existing backend renderer and evidence lookup continue to use
  `resource-access-failure/v1`.
- CLI: no new command. One-shot CLI/static deployment packaging may carry or reference the static
  renderer artifact.
- Web/UI: no lookup form and no Svelte-only diagnostic logic.
- Config: no new user-controlled config field. Existing explicit renderer URL override remains for
  backend-service topologies.
- Events: not applicable.
- Public docs/help: reuse existing diagnostics troubleshooting anchors because this slice adds no
  new user workflow or operation affordance.

## No ADR Needed

No new ADR is required. The slice implements ADR-017 generated access routing, ADR-019 observable
edge proxy configuration and access diagnostics, ADR-024 one-shot CLI/SSH limitations, ADR-029
observation boundaries, and ADR-030 docs/help closure. It does not change route ownership,
operation boundaries, durable state shape, retention semantics, route/domain/TLS lifecycle,
recovery semantics, or public error contracts.

## Non-Goals

- No real Traefik error-middleware e2e.
- No provider-native raw metadata parsing.
- No route repair, redeploy, rollback, certificate, or domain mutation behavior.
- No Web request-id lookup form.
- No new public operation, operation catalog row, or transport-only renderer schema.

## Open Questions

- Should a later provider-specific slice add real Traefik static/companion middleware e2e after
  the provider-neutral renderer artifact is stable?
