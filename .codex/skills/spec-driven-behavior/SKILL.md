---
name: spec-driven-behavior
description: Use when Codex needs to discover, specify, document, implement, reconcile, verify, post-check, or choose the next Appaloft business behavior/business operation from ADRs, global contracts, local command/query/event/workflow/error specs, implementation plans, operation catalog entries, read models, Web/API/CLI entrypoints, public docs anchors, or spec-driven test matrices. Supports artifact-guided behavior dossiers, incremental or complete readiness workflows, Discover Round, Spec Round, Docs Round, Test-First Round, Code Round, Sync Round, Next Behavior Selection, and Post-Implementation Sync.
---

# Spec-Driven Behavior

## Purpose

Use this skill to change one Appaloft business behavior as a complete operation, not as an isolated class, route, test, or endpoint.

Treat a behavior as the coordinated unit spanning command or query, event, workflow, error contract, read model/projection, test matrix, Web/API/CLI entrypoints, public documentation anchors, implementation plan, and ADR/global contracts when applicable.

Do not treat this skill as permission to move from specs into code automatically. The default round is Spec Round. Docs Round is required when the current prompt asks for public documentation or when a behavior changes user-visible input, output, status, recovery, workflow sequencing, or entrypoint affordances. Test-First Round is allowed only when the current prompt permits automated test work and the governing specs/test matrix are clear enough to write executable expectations. Code Round is allowed only when the current prompt permits implementation and the governing ADRs, global contracts, local specs, public documentation requirement, test matrix, automated tests, and implementation plan are clear enough.

## Load References

Keep this file as the routing layer. Load extra files only when their condition applies:

- `references/round-artifacts.md`: load before any non-trivial round to build the behavior artifact state, choose incremental vs complete readiness, maintain the behavior dossier, and record change intent.
- `references/round-details.md`: load when entering a concrete round and before editing files; it contains detailed round todos, execution rules, entrypoint-surface gates, ADR escalation, and synchronization surfaces.
- `references/verification.md`: load for Post-Implementation Sync, Sync Round, Code Round closure, or any request to verify whether implementation matches specs.
- `DISCOVERY_TEMPLATE.md`: use when no concrete behavior is selected.
- `CHECKLIST.md`: use to record the behavior dossier, artifact state, round todo, and coverage checklist.
- `OUTPUT_TEMPLATE.md`: use for final summaries after a formal round.

## Source-Of-Truth Rules

Always read governing documents before implementation, in this order:

1. `AGENTS.md`
2. `docs/decisions/README.md`
3. Relevant ADRs from `docs/decisions/`
4. `docs/BUSINESS_OPERATION_MAP.md`
5. `docs/CORE_OPERATIONS.md`
6. `docs/DOMAIN_MODEL.md`
7. Global contracts:
   - `docs/errors/model.md`
   - `docs/errors/neverthrow-conventions.md`
   - `docs/architecture/async-lifecycle-and-acceptance.md`
8. Relevant local specs:
   - `docs/commands/**`
   - `docs/events/**`
   - `docs/workflows/**`
   - `docs/errors/**`
   - `docs/testing/**`
9. When present:
   - `docs/documentation/**`
   - `docs/implementation/**`
   - `packages/application/src/operation-catalog.ts`

Use ADRs, `docs/BUSINESS_OPERATION_MAP.md`, global contracts, local specs, implementation plans, `docs/CORE_OPERATIONS.md`, `docs/documentation/**`, and `packages/application/src/operation-catalog.ts` as governing sources. Use `docs/ai/**` only as background analysis; it must not override accepted ADRs, the business operation map, global contracts, local specs, public documentation specs, or implementation plans.

Before adding or changing a behavior, locate it in `docs/BUSINESS_OPERATION_MAP.md`. If the behavior is absent, add or position it there during Spec Round before writing local specs or code. If the behavior is marked rebuild-required, do not implement it directly; first update or create the governing ADR, local specs, test matrix, and implementation plan.

Local specs use Normative Contract style. Read the main body as the target contract. Read `Current Implementation Notes And Migration Gaps` only as migration context. Read `Open Questions` only to identify decisions that still need ADR/user confirmation.

Public documentation is governed by `docs/decisions/ADR-030-public-documentation-round-and-platform.md`, `docs/documentation/public-docs-structure.md`, and `docs/testing/public-documentation-test-matrix.md`. Public docs are downstream of internal specs and must explain behavior from the user's task perspective instead of mirroring internal DDD/CQRS/spec folders.

## v1 Closure Target

Appaloft's current product target is a self-hosted deployment platform v1 with these closure needs:

- zero-to-SSH-server setup;
- application deployment;
- basic access path;
- basic domain/TLS capability;
- visible status, errors, events, and monitoring signals.

When selecting the next behavior, prioritize this v1 minimum loop over technical convenience or far-future platform depth.

## Artifact-Guided Workflow

For every non-trivial behavior, build an artifact state before editing files. Use `references/round-artifacts.md` for the full procedure.

Track these artifacts as `done`, `ready`, `blocked`, `not-applicable`, or `deferred-gap`:

1. Behavior identity and operation-map position
2. ADR/global-contract decision
3. Local command/query/event/workflow/error specs
4. Public docs outcome and stable help anchor decision
5. Test matrix rows with stable ids and automation levels
6. Implementation plan or explicit small-scope rationale
7. Automated tests that bind to matrix ids
8. Code/read model/entrypoint implementation
9. Post-Implementation Sync verification report

Use a behavior dossier as the compact state carrier for the current behavior. Include the operation name, operation-map state, governed ADRs, global contracts, local specs, test matrix ids, public docs anchors, entrypoints, code modules, current gaps, and change intent.

Record change intent in the dossier using `ADDED`, `MODIFIED`, `REMOVED`, and `RENAMED` for requirements, entrypoints, matrix rows, public docs anchors, and operation catalog entries. Apply accepted changes directly to Appaloft's source-of-truth docs; do not create a competing permanent delta-spec layer.

## Execution Modes

Choose one execution mode after the artifact state is known:

- **Incremental readiness**: create or reconcile exactly the next ready artifact, then stop with updated state. Use when requirements are unclear, the user asks to continue step-by-step, or a governance decision needs review.
- **Complete readiness**: complete all ready governance artifacts needed for the authorized next round, then stop at the next permission boundary. Use when scope is clear and the user asks to prepare the behavior for implementation or finish readiness.

Do not chain multiple round types in one turn unless the prompt explicitly requests it. Exception: a Code Round must finish with Post-Implementation Sync for the same behavior.

## Round Routing

### Discover Round

Use when the user has not specified a concrete behavior, command, or business operation.

Read `docs/BUSINESS_OPERATION_MAP.md`, `docs/CORE_OPERATIONS.md`, `packages/application/src/operation-catalog.ts`, and `docs/commands/**`; search for user terms across command specs, workflow specs, event specs, and operation catalog entries; list relevant candidates with command name, workflow/spec paths, and rationale. Use `DISCOVERY_TEMPLATE.md`. Do not edit code or specs.

### Spec Round

Use when the user asks for Markdown/spec work only, ADR work, implementation planning, readiness preparation, or when the governing contract is not sufficient for code.

Update ADRs first when boundaries or lifecycle rules change. Update `docs/BUSINESS_OPERATION_MAP.md` first when a behavior is new, absent, repositioned, or rebuild-required. Keep spec bodies source-of-truth / Normative Contract style. Put temporary implementation reality only in `Current Implementation Notes And Migration Gaps`; put undecided issues only in `Open Questions`.

### Docs Round

Use when the user asks for public documentation work, docs platform governance, help anchors, or when a behavior changes user-visible input, output, status, recovery, workflow sequencing, or entrypoint affordances.

Read ADR-030, public docs structure, and public documentation test matrix. Decide whether the behavior needs a task page, concept page, reference page, troubleshooting page, stable anchor on an existing page, not-user-facing reason, or migration gap. Keep public docs user-task oriented and avoid internal DDD/CQRS terminology in primary user journeys.

### Test-First Round

Use when the user asks to implement tests before business code, or when a new/changed behavior needs executable expectations before Code Round.

Update the governing test matrix first when changed behavior lacks numbered rows. Implement or rename tests so each changed matrix row has a matching test name with the matrix id. For every new or changed command, include at least one CLI or HTTP/oRPC e2e/acceptance row unless the matrix explicitly documents why none can exist.

### Code Round

Use only when implementation is allowed and the artifact state shows required governance as done, not-applicable, or explicitly deferred-gap.

Implement the smallest coherent behavior slice across core/application/adapters/transports. Keep command/query/event/workflow/error/read-model/tests/Web/API/CLI aligned with the governing specs. New business endpoints and CLI commands dispatch through `CommandBus` or `QueryBus`; transport inputs reuse command/query schemas; handlers delegate to use cases or query services. New business capabilities update both `docs/CORE_OPERATIONS.md` and `packages/application/src/operation-catalog.ts`.

Default Code Round closure includes an executable user-facing chain and the read/query surface needed for a user to observe the result. Every new or changed command must have at least one real CLI or HTTP/oRPC e2e/acceptance test unless the test matrix explicitly documents an exception.

### Sync Round

Use when implementation, specs, tests, or entrypoints have drifted.

Compare governing docs and test matrix against code and tests. Decide whether code should change, specs should change, tests should change, or an ADR is needed first. Keep legacy gaps explicit in migration notes instead of hiding drift.

### Next Behavior Selection

Use when the current behavior is implemented or basically implemented and the user asks what to do next.

Verify whether the current behavior completed Post-Implementation Sync. Rank candidates by v1 minimum-loop value. Start from `docs/BUSINESS_OPERATION_MAP.md`. Recommend exactly one next behavior, its next round type, governing sources, and lower-ranked backups. Do not start the next behavior unless explicitly asked.

### Post-Implementation Sync

Use immediately after a Code Round or when the user asks whether a behavior is implemented enough.

Load `references/verification.md`. Check code, specs, workflows, error mapping, tests, public docs/help anchors, and Web/API/CLI bus/schema dispatch. Output `aligned` or `not aligned`, remaining gaps, required updates, ADR need, and ready/not-ready result.

## Core Gates

Before any non-trivial edit, create or refresh a concrete todo from the artifact state. Todo items must be observable outcomes, not vague activities. Add newly discovered surfaces immediately. Include test matrix ids whenever tests or e2e/acceptance coverage are in scope.

Treat Web, CLI, API/oRPC, repository config files, public documentation, and future MCP/tool entrypoints as separate surfaces over the same operation. Do not call a behavior fully exposed if one first-class surface can accept new input while another silently cannot.

Create or update an ADR before local specs or code when a change touches command boundary, ownership scope, lifecycle stages, readiness rule, retry semantics, durable state shape, route/domain/TLS boundary, or long-running async acceptance semantics.

If implementation temporarily diverges from the normative spec, record that only under `Current Implementation Notes And Migration Gaps`; do not weaken the normative contract to match temporary code reality.

## Output

Use `OUTPUT_TEMPLATE.md` for formal final responses. Include round type, target behavior, operation-map position/state, artifact state summary, changed docs/code/tests/entrypoints, test matrix ids, public documentation/help surfaces, governed ADRs, remaining migration gaps, open questions, verification result, and next recommended behavior when relevant.

For verification output, use the `Completeness`, `Correctness`, and `Coherence` dimensions from `references/verification.md`. Critical gaps make the behavior `not aligned`; warnings do not override a missing required artifact.

## Bundled Templates

- `DISCOVERY_TEMPLATE.md`: use when behavior is not yet selected.
- `CHECKLIST.md`: use to build the behavior dossier, artifact state, round todo, and coverage checklist.
- `OUTPUT_TEMPLATE.md`: use for final response summaries.
