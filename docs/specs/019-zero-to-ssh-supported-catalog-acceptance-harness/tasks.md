# Tasks: Zero-to-SSH Supported Catalog Acceptance Harness

## Spec Round

- [x] Confirm PR #144 is merged and base this work on latest `main`.
- [x] Locate the behavior in `docs/BUSINESS_OPERATION_MAP.md` as workload framework
  detection/planning, deployment plan preview, deployment create, and runtime target abstraction.
- [x] Read AGENTS, ADR index, ADR-012, ADR-014, ADR-015, ADR-016, ADR-021, ADR-023, ADR-024,
  ADR-025, roadmap, operation docs, global contracts, local specs, test matrices, and specs
  013-018.
- [x] Record no-new-ADR rationale in the feature plan.
- [x] Create `docs/specs/019-zero-to-ssh-supported-catalog-acceptance-harness/spec.md`.
- [x] Create `docs/specs/019-zero-to-ssh-supported-catalog-acceptance-harness/plan.md`.
- [x] Create this task checklist.
- [x] Sync roadmap, workflow docs, runtime substrate plan, deployments.plan/deployments.create
  docs, and testing matrix rows with the harness contract.

## Test-First

- [x] `ZSSH-CATALOG-001`: Next.js supported fixture passes the harness.
- [x] `ZSSH-CATALOG-002`: Vite static SPA supported fixture passes the harness.
- [x] `ZSSH-CATALOG-003`: Astro static supported fixture passes the harness.
- [x] `ZSSH-CATALOG-004`: Nuxt generate supported fixture passes the harness.
- [x] `ZSSH-CATALOG-005`: SvelteKit static supported fixture passes the harness.
- [x] `ZSSH-CATALOG-006`: Remix supported fixture passes the harness.
- [x] `ZSSH-CATALOG-007`: FastAPI supported fixture passes the harness.
- [x] `ZSSH-CATALOG-008`: Django supported fixture passes the harness.
- [x] `ZSSH-CATALOG-009`: Flask supported fixture passes the harness.
- [x] `ZSSH-CATALOG-010`: generic Node supported fixture passes the harness.
- [x] `ZSSH-CATALOG-011`: generic Python supported fixture passes the harness.
- [x] `ZSSH-CATALOG-012`: generic Java supported fixture passes the harness.
- [x] `ZSSH-CATALOG-013`: Dockerfile container-native fixture passes the harness.
- [x] `ZSSH-CATALOG-014`: Docker Compose container-native fixture passes the harness.
- [x] `ZSSH-CATALOG-015`: prebuilt image container-native fixture passes the harness.
- [x] `ZSSH-CATALOG-016`: explicit custom commands fixture passes the harness.
- [x] `ZSSH-PREVIEW-001`: every supported fixture has `deployments.plan/v1` ready contract.
- [x] `ZSSH-PREVIEW-002`: unsupported/missing/ambiguous controls reuse 018 blocked preview shape.
- [x] `ZSSH-PREVIEW-003`: static shapes default to static-server `internalPort = 80`.
- [x] `ZSSH-PREVIEW-004`: buildpack evidence remains non-winning when explicit
  planner/custom/container-native profile wins.
- [x] `ZSSH-CREATE-001`: every supported fixture keeps `deployments.create` ids-only.
- [x] `ZSSH-CREATE-002`: preview/create artifact intent and command spec parity is asserted.
- [x] `ZSSH-CREATE-003`: serverful/SSR shapes supply explicit or deterministic internal port
  before admission.
- [x] `ZSSH-CREATE-004`: Web/CLI/API/repository config draft parity does not redefine
  transport-only profile shapes.
- [x] `ZSSH-RUNTIME-001`: runtime target backend selection happens before acceptance.
- [x] `ZSSH-RUNTIME-002`: fake/local/generic-SSH render/apply contract has no real SSH dependency.
- [x] `ZSSH-RUNTIME-003`: readiness/health/log/access observation contract is normalized.
- [x] `ZSSH-RUNTIME-004`: local Docker smoke remains opt-in and clearly gated.
- [x] `ZSSH-RUNTIME-005`: real generic-SSH smoke remains opt-in and clearly gated.

## Implementation

- [x] Consolidate reusable fixture descriptors/builders where needed.
- [x] Add hermetic fake runtime target/backend fixture coverage if the existing registry tests are
  not sufficient.
- [x] Add/refine provider-neutral contract fields only if tests reveal a real gap.
- [x] Bind supported catalog fixtures to existing planners; do not add new planner families.
- [x] Keep runtime execution fake/hermetic by default; preserve existing opt-in Docker/SSH smoke
  gates.

## Entrypoints And Docs

- [x] Keep API/oRPC, CLI, Web, repository config/headless, and future MCP/tool semantics aligned to
  shared profile draft plus `deployments.plan`/ids-only `deployments.create`.
- [x] Public docs/help outcome: use existing deployment plan preview and resource profile anchors
  unless user-visible support copy changes.

## Verification

- [x] Run targeted harness tests.
- [x] Run targeted deployment plan preview contract tests.
- [x] Run targeted runtime target backend tests.
- [x] Run targeted typecheck or document why it was not run.

## Post-Implementation Sync

- [x] Reconcile feature artifact, roadmap, operation map, workflow docs, runtime substrate plan,
  deployments.plan/deployments.create docs, testing matrices, public docs/help gaps, and executable
  test bindings.
- [x] Record remaining migration gaps explicitly.
