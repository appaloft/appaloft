# Tasks: Deployment Plan Preview

## Spec Round

- [x] Locate the behavior in `docs/BUSINESS_OPERATION_MAP.md`.
- [x] Decide operation boundary: `deployments.plan` is a read-only Query.
- [x] Record no-new-ADR rationale in the feature spec.
- [x] Create `docs/specs/013-deployment-plan-preview/spec.md`.
- [x] Create `docs/specs/013-deployment-plan-preview/plan.md`.
- [x] Create this task checklist.
- [x] Add local query spec for `deployments.plan`.
- [x] Add local error spec for deployment plan preview.
- [x] Add dedicated test matrix with stable ids.
- [x] Add implementation plan for the query Code Round.
- [x] Update workload framework detection/planning workflow to name the public preview query.
- [x] Update operation map, `CORE_OPERATIONS.md`, and roadmap for the planned active query.

## Test-First Round

- [ ] Add automated query tests for `DPP-QUERY-001` through `DPP-QUERY-008`.
- [ ] Add contract tests for `DPP-SIDE-EFFECT-001` through `DPP-SIDE-EFFECT-003`.
- [x] Add operation catalog/API docs contract coverage for `DPP-HTTP-001`.
- [x] Add CLI help/docs coverage for `DPP-CLI-001` and `DPP-CLI-002`.
- [x] Add Web read-only affordance docs/help coverage for `DPP-WEB-001`.
- [x] Add public docs/help coverage for `PUB-DOCS-002`, `PUB-DOCS-003`, `PUB-DOCS-011`,
  `PUB-DOCS-012`, and `PUB-DOCS-016`.

## Code Round

- [x] Add `deployments.plan` operation catalog entry and keep `CORE_OPERATIONS.md` synchronized.
- [x] Add application schema, query, handler, and query service.
- [x] Reuse deployment runtime planning/source inspection services without creating deployment
  attempts or running runtime execution.
- [x] Add HTTP/oRPC route and typed client/query helper.
- [x] Add CLI `appaloft deployments plan ...`.
- [x] Add Web Quick Deploy or Resource detail read-only plan preview affordance.
- [x] Add i18n keys and help registry topic for the Web/CLI/API surfaces.
- [x] Add public docs page/anchor updates for `deployment-plan-preview`.
- [x] Run targeted tests named with stable matrix ids.

## Post-Implementation Sync

- [x] Reconcile roadmap, operation map, `CORE_OPERATIONS.md`, operation catalog, query/error/test
  docs, implementation plan, public docs, i18n/help registry, and migration gaps.
- [x] Confirm `deployments.create` remains the only general deployment admission command.
- [x] Confirm no retry/redeploy/rollback/cancel behavior was introduced.
- [x] Record targeted verification commands and any skipped full-suite checks.
