# Contextual Dashboard App — Tasks

## Spec Round

- [x] Complete Grill discovery and owner decisions DASH-D1–D14.
- [x] Owner confirms ADR-126, Spec 147, plan, tasks, and test matrix on 2026-08-24.
- [x] Set ADR-126 to Accepted and Spec state to confirmed.
- [x] Derive actor-visible public tickets and mark only information-complete tickets
      `ready-for-agent`.

## Ticket Round

- [x] Tracking: [appaloft/appaloft#1422](https://github.com/appaloft/appaloft/issues/1422).
- [x] Foundation preview: [#1423](https://github.com/appaloft/appaloft/issues/1423), `ready-for-agent`.
- [x] Projects -> Project -> Resource beta loop: [#1424](https://github.com/appaloft/appaloft/issues/1424), `ready-for-agent`.
- [x] Resource operations: [#1425](https://github.com/appaloft/appaloft/issues/1425), `ready-for-agent`.
- [x] Workspace/Project breadth: [#1426](https://github.com/appaloft/appaloft/issues/1426), `ready-for-agent`.
- [x] Benchmark-gated Topology: [#1427](https://github.com/appaloft/appaloft/issues/1427), `ready-for-agent`.
- [x] Public default cutover: [#1428](https://github.com/appaloft/appaloft/issues/1428), `ready-for-agent`.
- [x] Luminous surface refinement: [#1430](https://github.com/appaloft/appaloft/issues/1430),
      `ready-for-agent`.

## Foundation

- [x] Record the same-toolchain legacy bundle baseline and deterministic 1/10/50/100 fixtures.
- [ ] Record comparable legacy/Dashboard product-data request and timing baselines once #1424 adds
      the first real summary-query loop; #1423 does not present its static preview as zero-request
      control-plane evidence.
- [x] Add `apps/dashboard` workspace, static build, local command, and selectable bundle seam.
- [x] Add `dashboard-v2` tokens and keep `legacy-console-v1` isolated to `apps/web`.
- [x] Add Dashboard design skill, lint, token/DESIGN drift check, pattern gallery, and visual tests.
- [x] Refine Dashboard v2 with brighter semantic surfaces, restrained ambient light, pastel icon
      surfaces, and lifted Dark under DASH-VIS-005.
- [x] Add route-state, responsive shell, accessibility, and performance harnesses.

## Public Contracts

- [x] Add `projects.list-summaries` spec/catalog/query/transport/tests and real Dashboard Projects
      loading/search/sort/cursor states in the first #1424 tracer slice.
- [ ] Add `project-environments.overview` spec/catalog/query/transport/tests.
- [ ] Add `resources.overview` spec/catalog/query/transport/tests.
- [ ] Add scoped extension navigation metadata while preserving the v1 page renderer.
- [ ] Update Business Operation Map, Core Operations, docs registry, and generated interface parity.

## Vertical Slices

- [ ] Projects Workspace list and creation/open path.
- [ ] Project Overview/List, Environment URL context, and Resource selection.
- [ ] Resource Overview/Deployments route-backed panel/full page.
- [ ] Resource Configuration, Logs & Metrics, Networking, and Settings.
- [ ] Infrastructure and Activity.
- [ ] Marketplace and Settings.
- [ ] Project Deployments, Observability, and Settings.
- [ ] Contextual Agent utility entry without a new lifecycle owner.
- [ ] Benchmark-gated Topology view with List fallback.

## Rollout And Docs

- [x] Record luminous-surface refinement PR #1431 and public `main` SHA
      `0dfe728286a5cedcf08c6d49d027f146f5574c9d` before the downstream hosted pin sync.
- [ ] Existing-anchor Docs Round: update both `reference/web-console` locales and docs registry.
- [ ] Add breaking-route release note; do not add redirect promises.
- [ ] Enable opt-in beta only after DASH-BETA rows pass.
- [ ] Enable default only after all DASH-DEFAULT rows pass.
- [ ] Run independent Public/Private Boundary Review after public implementation and merge.
- [ ] Record public PR/final main SHA before any downstream hosted pin/cutover.
