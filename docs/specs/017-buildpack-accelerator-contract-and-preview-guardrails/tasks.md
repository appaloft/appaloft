# Tasks: Buildpack Accelerator Contract And Preview Guardrails

## Spec Round

- [x] Confirm PR #142 is merged and base this work on latest `main`.
- [x] Locate the behavior in `docs/BUSINESS_OPERATION_MAP.md` as workload framework
  detection/planning plus `deployments.plan`.
- [x] Read ADR-010, ADR-012, ADR-014, ADR-016, ADR-021, ADR-023, ADR-024, and ADR-025.
- [x] Record no-new-ADR rationale in the feature spec.
- [x] Create `docs/specs/017-buildpack-accelerator-contract-and-preview-guardrails/spec.md`.
- [x] Create `docs/specs/017-buildpack-accelerator-contract-and-preview-guardrails/plan.md`.
- [x] Create this task checklist.
- [x] Sync workflow/query/runtime-substrate docs with buildpack accelerator boundaries.
- [x] Add stable `WF-PLAN-BP-*` and `DPP-CATALOG-BP-*` matrix rows before Code Round.

## Test-First

- [x] `WF-PLAN-BP-001`: explicit framework planner evidence wins over buildpack evidence.
- [x] `WF-PLAN-BP-002`: explicit custom/container-native profile wins over buildpack evidence.
- [x] `WF-PLAN-BP-003`: unknown but buildpack-detectable source produces buildpack-accelerated
  preview only.
- [x] `WF-PLAN-BP-004`: buildpack disabled or unavailable target is blocked in preview.
- [x] `WF-PLAN-BP-005`: unsupported builder or lifecycle feature is blocked with stable reason.
- [x] `WF-PLAN-BP-006`: ambiguous buildpack evidence is blocked or requires override.
- [x] `WF-PLAN-BP-007`: missing internal port remains a resource-network blocker.
- [x] `WF-PLAN-BP-008`: explicit runtime/build/start override wins over buildpack candidate.
- [x] `WF-PLAN-BP-009`: environment/build/runtime variable boundary masks secrets and preserves
  build-time public variable rules.
- [ ] `WF-PLAN-BP-010`: future MCP/tool metadata uses the same preview contract shape.
  Deferred gap until MCP/tool surfaces are active; matrix and operation-map language now require
  parity through `deployments.plan`.
- [x] `DPP-CATALOG-BP-001`: ready buildpack-accelerated `deployments.plan/v1` output parity.
- [x] `DPP-CATALOG-BP-002`: blocked buildpack `deployments.plan/v1` output parity.
- [x] Add executable contract tests with matrix ids in test names before production changes.

## Implementation

- [x] Consolidate/reuse planner contract types/services only where tests require it.
- [x] Add adapter-owned buildpack accelerator interface or hermetic fake resolver if needed.
  Not needed in this slice because contract tests exercise hermetic preview payloads without
  runtime adapter execution.
- [x] Extend `deployments.plan/v1` with buildpack evidence, support tier, limitations, and reason
  codes without changing deployment admission.
- [x] Ensure `deployments.create` remains ids-only and no buildpack/builder fields are accepted by
  deployment admission.
- [x] Do not wire real buildpack runtime execution unless a later spec/test slice governs it.

## Entrypoints And Docs

- [x] Update roadmap and implementation notes to mark buildpack accelerator contract/preview
  guardrails without claiming real execution.
- [x] Update `deployments.plan` query/test matrix status for buildpack preview parity.
- [x] Record public docs/help outcome for this behavior.

## Verification

- [x] Run targeted contract tests for deployment plan preview schema.
- [x] Run targeted runtime/application tests for buildpack precedence and guardrails.
  Contract-layer hermetic preview tests cover the current slice; runtime adapter execution is
  deferred.
- [x] Run targeted typecheck or document why it was not run.

## Post-Implementation Sync

- [x] Reconcile feature artifact, roadmap, operation map, workflow docs, implementation plan, test
  matrices, public docs/help gaps, and executable test bindings.
