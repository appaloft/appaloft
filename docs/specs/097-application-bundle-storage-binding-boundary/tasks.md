# Tasks: Application Bundle Storage Binding Boundary

## Source Of Truth

- [x] APP-BUNDLE-STORAGE-SOT-001: add public spec/plan/tasks for application bundle storage binding separation.
- [x] APP-BUNDLE-STORAGE-SOT-001: update Blueprint and Domain Model docs if the current bundle contract needs clearer storage language.

## Test-First

- [x] APP-BUNDLE-STORAGE-PLAN-001: add or update a bundle plan test for a volume-backed component storage binding.
- [x] APP-BUNDLE-STORAGE-PLAN-002: add or update a bundle plan test proving service dependencies stay dependency bindings.
- [x] APP-BUNDLE-STORAGE-PLAN-003: add a bundle/install-plan test proving volume requirements do not create dependency bindings.
- [x] APP-BUNDLE-STORAGE-RUNTIME-001: add runtime projection coverage for `storageRequirementId` and storage binding refs.
- [x] APP-BUNDLE-STORAGE-UPGRADE-001: mark upgrade dry-run comparison not applicable for this slice because upgrade planning behavior was not changed.

## Implementation

- [x] Add neutral top-level `storageBindings` readback.
- [x] Add canonical `storageRequirementId` aliases to bundle and runtime storage mount readback while preserving legacy aliases.
- [x] Make install planning skip dependency binding/readiness operations for `volume`.
- [x] Keep legacy compatibility aliases at the boundary rather than treating volumes as dependencies internally.

## Entrypoints And Docs

- [x] Update public Blueprint docs/help if user-facing docs still describe `volume` as a dependency resource.
- [x] Record downstream installer migration requirements as deferred outside public Appaloft.

## Verification

- [x] Run focused `@appaloft/blueprints` tests if code changes.

## Post-Implementation Sync

- [x] Reconcile spec, plan, tasks, docs, package contract, tests, and downstream migration notes.

## Deferred Outside Public Slice

- Downstream installer persistence migrations belong to hosted/private distributions that consume
  the public `storageBindings` readback.
- Upgrade dry-run comparison coverage should be added with the first public upgrade-planning
  behavior change that compares storage bindings.
