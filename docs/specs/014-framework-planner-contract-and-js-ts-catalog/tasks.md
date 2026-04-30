# Tasks: Framework Planner Contract And JavaScript/TypeScript Tested Catalog

## Spec Round

- [x] Confirm PR #139 is merged and base this work on `main`.
- [x] Locate the behavior in `docs/BUSINESS_OPERATION_MAP.md` as workload framework detection/planning plus `deployments.plan`.
- [x] Read ADR-010, ADR-012, ADR-014, ADR-016, ADR-021, and ADR-023.
- [x] Record no-new-ADR rationale in the feature spec.
- [x] Create `docs/specs/014-framework-planner-contract-and-js-ts-catalog/spec.md`.
- [x] Create `docs/specs/014-framework-planner-contract-and-js-ts-catalog/plan.md`.
- [x] Create this task checklist.

## Test-First

- [x] Add stable JS/TS matrix ids for Next.js SSR/standalone/static export, Remix, Nuxt generate, SvelteKit static/ambiguous server, Astro static, static SPA frameworks, Node HTTP frameworks, generic package scripts, and unsupported/missing evidence cases.
- [x] Bind existing fixture planner tests to the new JS/TS matrix ids.
- [x] Add `deployments.plan` catalog contract rows for ready JS/TS preview and blocked unsupported/ambiguous preview.
- [x] Add executable contract test coverage for `deployments.plan/v1` catalog output shape.

## Implementation

- [x] Keep production behavior within the existing planner contract; add code only if tests reveal a catalog contract gap.
- [x] Ensure `deployments.create` remains ids-only and no planner fields are accepted by deployment admission.

## Entrypoints And Docs

- [x] Update roadmap and implementation notes to mark JS/TS tested catalog closure without claiming full real Docker/SSH fixture coverage.
- [x] Update `deployments.plan` query spec status after PR #139.
- [x] Record public docs/help outcome for this behavior: existing deployment lifecycle and resource source/runtime docs/help anchors cover the preview and profile fix path; no new page required.

## Verification

- [x] Run targeted runtime fixture tests.
- [x] Run targeted contracts test for deployment plan preview schema.

## Post-Implementation Sync

- [x] Reconcile feature artifact, roadmap, operation map, workflow docs, implementation plan, test matrices, public docs/help gaps, and executable test bindings.
