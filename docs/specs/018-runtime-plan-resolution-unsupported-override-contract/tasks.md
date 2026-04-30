# Tasks: Runtime Plan Resolution Unsupported/Override Contract

## Spec Round

- [x] Confirm PR #143 is merged and work from latest `main`.
- [x] Read governing ADRs, roadmap, operation map, query/command/workflow specs, implementation
  plan, test matrices, and specs 013-017.
- [x] Create `docs/specs/018-runtime-plan-resolution-unsupported-override-contract/spec.md`.
- [x] Create `docs/specs/018-runtime-plan-resolution-unsupported-override-contract/plan.md`.
- [x] Create `docs/specs/018-runtime-plan-resolution-unsupported-override-contract/tasks.md`.
- [x] Sync workflow/query/command/runtime-substrate docs with the shared unsupported/override
  contract.

## Test-First

- [x] `WF-PLAN-FAIL-001`: unsupported framework blocks runtime plan resolution.
- [x] `WF-PLAN-FAIL-002`: unsupported runtime family blocks runtime plan resolution.
- [x] `WF-PLAN-FAIL-003`: ambiguous framework evidence requires source/profile override.
- [x] `WF-PLAN-FAIL-004`: ambiguous build tool requires explicit tool/source selection.
- [x] `WF-PLAN-FAIL-005`: missing build tool has stable fix/override path.
- [x] `WF-PLAN-FAIL-006`: missing start/build intent is fixed by explicit commands.
- [x] `WF-PLAN-FAIL-007`: missing internal port blocks serverful HTTP/SSR.
- [x] `WF-PLAN-FAIL-008`: static shape defaults to static-server internal port 80.
- [x] `WF-PLAN-FAIL-009`: missing source root/base directory has fix/override path.
- [x] `WF-PLAN-FAIL-010`: missing artifact output has fix/override path.
- [x] `WF-PLAN-FAIL-011`: unsupported runtime target blocks before execution.
- [x] `WF-PLAN-FAIL-012`: unsupported container-native profile blocks with explicit profile fix.
- [x] `DPP-PLAN-FAIL-001`: blocked preview includes phase, reason code, evidence, fix path,
  override path, and affected profile field.
- [x] `DPP-PLAN-FAIL-002`: `deployments.plan/v1` ready/blocked parity preserves the same contract.
- [x] `DPP-PLAN-FAIL-003`: explicit custom/container-native profile wins over detection.
- [x] `DPP-PLAN-FAIL-004`: buildpack candidate cannot override explicit planner/custom/container
  profile.
- [x] `DPP-PLAN-FAIL-005`: health and environment variable guardrails are visible and masked.
- [x] `DPP-PLAN-FAIL-006`: CLI/API/Web/future MCP metadata use the same preview shape.

## Implementation

- [x] Consolidate or reuse planner blocked-preview contract types/services.
- [x] Add/refine provider-neutral reason-code and support-tier contract values where needed.
- [x] Extend `deployments.plan/v1` preview output with the blocked/fix/override shape while
  keeping existing compatibility fields when needed.
- [x] Add hermetic fake resolver/planner fixtures for unsupported/ambiguous/missing cases.
- [x] Ensure `deployments.create` rejects the same pre-execution unsupported/ambiguous/missing
  cases without adding input fields.
- [x] Do not wire real Docker/buildpack/pack/lifecycle execution in this round.

## Entrypoints And Docs

- [x] Keep API/oRPC, CLI, Web, repository config/headless, and future MCP/tool metadata aligned to
  `deployments.plan`.
- [x] Update public docs/help only if user-visible preview output changes beyond existing anchors.

## Verification

- [x] Run targeted tests for runtime plan resolution blocked/fix/override contract.
- [x] Run targeted `deployments.plan` contract tests.
- [x] Run targeted typecheck or lint slice when feasible.

## Post-Implementation Sync

- [x] Reconcile roadmap, operation map, workflow docs, deployment runtime substrate plan,
  `deployments.plan`, `deployments.create`, test matrices, feature artifact tasks, and docs/help
  gaps.
- [x] Record remaining migration gaps explicitly.
