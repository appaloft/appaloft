# Contextual Dashboard App — Plan

## Governing

- [ADR-126](../../decisions/ADR-126-contextual-dashboard-and-web-route-boundary.md)
- [spec.md](./spec.md)
- [Contextual Dashboard Test Matrix](../../testing/contextual-dashboard-test-matrix.md)

## Delivery Order

### Phase 0 — Baseline And Foundation

- Capture legacy Web Projects/Project/Resource request counts, p95 timings, bundle size, and
  10/50/100 Resource fixtures.
- Scaffold `apps/dashboard` as a static SvelteKit app using public oRPC client, i18n, Tailwind v4,
  shadcn-svelte, `@appaloft/ui`, and `@appaloft/design` only.
- Add `dashboard-v2` semantic tokens, light/dark theme, pattern gallery, design lint/skill, token-doc
  drift test, Playwright visual fixtures, and performance harness.
- Make local/release static surface selection explicit without changing the default.

### Phase 1 — First Closed Loop

- Add the three bounded public summary queries and transports.
- Implement persistent Workspace/Project layouts and canonical URL helpers.
- Deliver Projects list, Project Overview/List, Environment switcher, Resource route/panel, and
  Resource Overview/Deployments destinations with real data and state handling.
- Preserve v1 extension page rendering and introduce additive scoped navigation metadata.
- Pass DASH-BETA rows before enabling opt-in beta.

### Phase 2 — Resource Completion

- Deliver Configuration, Logs & Metrics, Networking, and Settings using lazy destination data.
- Verify teardown of polling, streams, editors, charts, and terminal surfaces.
- Add mobile full-page Resource behavior and keyboard resize behavior.

### Phase 3 — Workspace And Project Breadth

- Deliver Infrastructure, Activity, Marketplace, Settings, Project Deployments, Project
  Observability, and Project Settings to the minimum usable outcomes in the Spec.
- Map existing and composed extension contributions into contextual destinations.
- Update bilingual Web console docs, help registry, and release notes.

### Phase 4 — Topology And Default Cutover

- Implement Topology only after the benchmark harness and List fallback exist.
- Pass 10/50/100 Resource performance and visual/a11y coverage.
- Switch the default build/static surface while retaining an explicit legacy rollback selector.
- Remove legacy Web only in a later separately authorized cleanup slice.

## Architecture

- `apps/dashboard` does not import `apps/web` source. Reuse happens only through public packages.
- Root layouts own shell/context and nested routes own destination data.
- URL parsing/serialization is one module shared by links, panel close, Back/Forward, and tests.
- Query keys include the execution tenant implicitly plus explicit Project/Environment/Resource
  identifiers and route filters.
- Summary projections live in application/persistence/transport layers; Svelte components never
  join broad business collections into page truth.
- Cloud/private composition consumes public extension contracts only after public merge.

## Verification Sequence

1. Focused query/read-model and extension contract tests.
2. Dashboard unit/component tests and route-state tests.
3. Playwright functional, keyboard, responsive, and light/dark visual tests.
4. Performance harness on legacy and Dashboard fixtures.
5. Public lint, typecheck, test, and build gates.
6. Public/Private Boundary Review before downstream hosted Code resumes.
