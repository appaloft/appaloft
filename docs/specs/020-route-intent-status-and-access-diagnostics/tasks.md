# Tasks: Route Intent/Status And Access Diagnostics

## Spec Round

- [x] Confirm PR #145 is merged and base this work on latest `main`.
- [x] Locate the behavior in `docs/BUSINESS_OPERATION_MAP.md` as default access routing, edge proxy
  route realization, resource health, runtime logs, resource diagnostic summary, resource access
  failure diagnostics, and runtime target abstraction.
- [x] Read governing ADRs, roadmap, operation docs, global contracts, workflow/query specs,
  existing test matrices, and spec 019.
- [x] Record no-new-ADR rationale in `plan.md`.
- [x] Create `spec.md`.
- [x] Create `plan.md`.
- [x] Create this task checklist.
- [x] Sync roadmap, operation docs, workflow docs, query specs, and testing matrices with the
  route intent/status contract.

## Test-First

- [x] `ROUTE-INTENT-001`: generated access route descriptor is built from planned/latest generated
  access without treating it as a durable domain binding.
- [x] `ROUTE-INTENT-002`: durable domain route descriptor wins current-route precedence when ready.
- [x] `ROUTE-INTENT-003`: server-applied route descriptor wins over generated access when no
  durable route is selected.
- [x] `ROUTE-INTENT-004`: deployment snapshot route descriptor is immutable historical context and
  not the current resource route by default.
- [x] `ROUTE-STATUS-001`: proxy route missing/stale/failed states become typed route status, not a
  deployment admission failure.
- [x] `ROUTE-STATUS-002`: domain not verified remains a selected blocking route state while
  fallback generated/server-applied routes stay visible as context.
- [x] `ROUTE-STATUS-003`: certificate missing/expired/not active remains typed route access state
  for diagnostics and future certificate lifecycle work.
- [x] `ROUTE-STATUS-004`: observation unavailable becomes a typed source error/status.
- [x] `ACCESS-DIAG-001`: runtime-not-ready and health-check-failing diagnostics compose into
  health/diagnostic summaries without parsing log text.
- [x] `ACCESS-DIAG-002`: proxy route missing/stale diagnostics compose into proxy preview,
  health, and diagnostic summary.
- [x] `ACCESS-DIAG-003`: domain/DNS/TLS diagnostics use stable blocking reason codes and safe
  recommended actions.
- [x] `ACCESS-DIAG-004`: copy payload is secret-safe and excludes raw provider SDK payloads, private
  keys, env values, headers/cookies, internal coordinates, and raw command output.
- [x] `PROXY-OBS-001`: proxy preview renders selected route with durable/server-applied/generated
  precedence through a fake provider.
- [x] `PROXY-OBS-002`: fake route apply/readback records applied/not-ready/stale/failed route
  status without real DNS/TLS/SSH/reverse proxy.
- [x] `PROXY-OBS-003`: deployment-snapshot route scope stays explicitly historical.
- [x] `HEALTH-ACCESS-001`: `resources.health` uses the same selected route and blocking reason
  vocabulary as diagnostics.
- [x] `HEALTH-ACCESS-002`: runtime log unavailable state remains a log/access diagnostic state, not
  proof of runtime failure.
- [x] `HEALTH-ACCESS-003`: latest edge access failure envelopes degrade health/access without
  mutating deployment state.
- [x] `WEB-CLI-API-ACCESS-001`: API/oRPC schema exposes the shared route/access contract.
- [x] `WEB-CLI-API-ACCESS-002`: CLI renders/prints the query contract without redefining
  transport-only route shapes.
- [x] `WEB-CLI-API-ACCESS-003`: Web selects display routes from shared route precedence helper and
  does not hide business logic in Svelte-only code.

## Implementation

- [x] Consolidate provider-neutral route/access diagnostic descriptor types at the application and
  contracts boundary where needed.
- [x] Add hermetic fake proxy/route observation fixtures if existing fakes are insufficient.
- [x] Add or refine read-model fields only where required by the test-first contract.
- [x] Bind generated access, durable domain routes, server-applied routes, proxy preview, health,
  runtime logs, and diagnostic summary to the shared descriptor vocabulary.
- [x] Keep real Traefik/DNS/TLS/SSH smoke optional and gated.

## Entrypoints And Docs

- [x] Keep API/oRPC, CLI, Web, and future MCP/tool behavior aligned through operation catalog and
  shared query contracts.
- [x] Public docs/help outcome: reuse existing access/proxy/diagnostics anchors unless
  implementation changes user-visible copy.

## Verification

- [x] Run targeted application tests for resource access summary, proxy preview, health, diagnostic
  summary, and access failure diagnostics.
- [x] Run targeted Web route-selection tests if Web helper behavior changes.
- [x] Run targeted typecheck or document why it was not run.

## Post-Implementation Sync

- [x] Reconcile feature artifact, roadmap, operation map, workflow docs, query specs, testing
  matrices, public docs/help gaps, tests, and code.
- [x] Record remaining migration gaps explicitly.
