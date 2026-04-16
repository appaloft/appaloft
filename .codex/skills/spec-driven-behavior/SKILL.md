---
name: spec-driven-behavior
description: Use when Codex needs to discover, specify, implement, reconcile, post-check, or choose the next Yundu business behavior/business operation from ADRs, global contracts, local command/query/event/workflow/error specs, implementation plans, operation catalog entries, read models, Web/API/CLI entrypoints, or spec-driven test matrices. Supports explicit Discover Round, Spec Round, Code Round, Sync Round, Next Behavior Selection, and Post-Implementation Sync.
---

# Spec-Driven Behavior

## Purpose

Use this skill to change one Yundu business behavior as a complete operation, not as an isolated class or endpoint.

Treat a behavior as the coordinated unit spanning command or query, event, workflow, error contract, read model/projection, test matrix, Web/API/CLI entrypoints, implementation plan, and ADR/global contracts when applicable.

Do not treat this skill as permission to move from specs into code automatically. The default round is Spec Round. Test-First Round is allowed only when the current prompt permits automated test work and the governing specs/test matrix are clear enough to write executable expectations. Code Round is allowed only when the current prompt permits implementation and the governing ADRs, global contracts, local specs, test matrix, automated tests, and implementation plan are clear enough.

## Source-Of-Truth Rules

Always read governing documents before implementation:

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
   - `docs/implementation/**`
   - `packages/application/src/operation-catalog.ts`

Use ADRs, `docs/BUSINESS_OPERATION_MAP.md`, global contracts, local specs, implementation plans, `docs/CORE_OPERATIONS.md`, and `packages/application/src/operation-catalog.ts` as governing sources. Use `docs/ai/**` only as background analysis; it must not override accepted ADRs, the business operation map, global contracts, local specs, or implementation plans.

Before adding or changing a behavior, locate it in `docs/BUSINESS_OPERATION_MAP.md`. If the behavior is absent, add or position it there during Spec Round before writing local specs or code. If the behavior is marked rebuild-required, do not implement it directly; first update or create the governing ADR, local specs, test matrix, and implementation plan.

Local specs use Normative Contract style. Read the main body as the target contract. Read `Current Implementation Notes And Migration Gaps` only as migration context. Read `Open Questions` only to identify decisions that still need ADR/user confirmation.

## v1 Closure Target

Yundu's current product target is a self-hosted deployment platform v1 with these closure needs:

- zero-to-SSH-server setup;
- application deployment;
- basic access path;
- basic domain/TLS capability;
- visible status, errors, events, and monitoring signals.

When selecting the next behavior, prioritize this v1 minimum loop over technical convenience or far-future platform depth.

## Round Types

### 1. Discover Round

Use when the user has not specified a concrete behavior, command, or business operation.

Do this:

- read `docs/BUSINESS_OPERATION_MAP.md`, `docs/CORE_OPERATIONS.md`, `packages/application/src/operation-catalog.ts`, and `docs/commands/**`;
- search for user terms across command specs, workflow specs, event specs, and operation catalog entries;
- list the most relevant candidate behaviors;
- include each candidate's command name, workflow/spec paths, and a one-line rationale;
- ask the user to pick one candidate before editing code or specs.

Use `DISCOVERY_TEMPLATE.md` for the response shape.

Do not edit code in Discover Round. Do not guess a behavior and proceed when the user has not selected one.

### 2. Spec Round

Use when the user asks for Markdown/spec work only, ADR work, implementation planning, or when the governing contract is not yet sufficient for code.

This is the default round.

Do this:

- update ADRs first when boundaries or lifecycle rules change;
- update `docs/BUSINESS_OPERATION_MAP.md` first when a behavior is new, absent, repositioned, or rebuild-required;
- keep spec bodies source-of-truth / Normative Contract style;
- place current implementation gaps only in `Current Implementation Notes And Migration Gaps`;
- place undecided issues only in `Open Questions`;
- update related command, event, workflow, error, testing, and implementation plan docs together.

Do not change business code, tests, package files, or config in Spec Round.

### 3. Test-First Round

Use when the user asks to implement tests before business code, or when a new/changed behavior needs executable expectations before Code Round.

Do this:

- update or add the governing `docs/testing/**` test matrix before writing tests if the changed behavior lacks numbered matrix rows;
- implement or rename automated tests so each changed matrix row has a matching test name with the matrix id;
- prefer CLI or HTTP/oRPC e2e/acceptance tests for complete command/workflow chains, then add integration/unit tests for branch coverage and pure domain rules;
- classify every changed matrix row by the strongest boundary that can actually observe the assertion: `e2e-preferred` for CLI/HTTP/Web plus public read/query observability, `integration` for repository state/events/process-manager/adapter behavior, `unit` for pure domain/planner rules, and `contract` for schema/route/provider-port compatibility;
- do not change business implementation code, package files, or config unless the change is limited to test fixtures or test harness wiring;
- allow intentionally failing tests only when they express the target behavior from the governing specs.

Output must list any failing matrix ids and the Code Round work expected to make them pass. The behavior remains `not aligned` until the tests pass or the matrix is revised by Spec Round.

### 4. Code Round

Use only when the user allows implementation and the relevant ADRs, global contracts, local specs, test matrix, automated tests, and implementation plan are sufficiently clear.

Do this:

- implement the smallest coherent behavior slice;
- keep command/query/event/workflow/error/read-model/tests/Web/API/CLI aligned with the governing specs;
- update tests in the same change when behavior or boundaries are touched, using the test case ids from the governing test matrix in automated test names;
- update migration notes when implementation intentionally does not fully reach the spec yet.

Follow repository CQRS rules:

- new business endpoints and CLI commands dispatch via `CommandBus` or `QueryBus`;
- transport inputs reuse command/query schemas rather than defining parallel transport-only shapes;
- application handlers delegate to use cases or application services and do not contain persistence or transport logic;
- query handlers delegate to query services/read models and do not read persistence directly from transports;
- new business capabilities update both `docs/CORE_OPERATIONS.md` and `packages/application/src/operation-catalog.ts` in the same change;
- new or changed behaviors must already be positioned in `docs/BUSINESS_OPERATION_MAP.md`;
- neverthrow boundaries follow `docs/errors/neverthrow-conventions.md`.

Default Code Round closure includes an executable user-facing chain and the read/query surface needed for a user to observe the result of the behavior. Prefer a real CLI command or HTTP/oRPC API call for this e2e/acceptance chain; browser automation is required only when the Web workflow itself is the behavior under test. Do not treat a write-side command as complete if the only way to confirm it worked is by inspecting persistence manually. If Web, API, CLI, or query/read model coverage is intentionally deferred, record that explicitly in the final gaps and in the relevant migration notes.

For changed commands and workflows, the behavior test matrix must enumerate scenario coverage across happy path, validation, lifecycle transitions, workflow branches, error mapping, emitted events, read/query observability, and Web/API/CLI entrypoints where applicable. Each required matrix row must have a stable test case id and preferred automation level. Mark entrypoint-to-read-model chains as `e2e-preferred` when they can be executed through CLI or HTTP/oRPC, and add integration/unit tests underneath for branch coverage and pure domain behavior.

Do not use `e2e-preferred` for assertions an external user chain cannot observe directly, such as exact repository fields, internal method calls, hidden process-manager state, or adapter call ordering. Split those into companion `integration`, `unit`, or `contract` rows while keeping a separate `e2e-preferred` row for the user-visible chain when one exists.

Treat every operation catalog entry as first-class test scope. New or changed tests for an explicit operation must live in operation-named test files, not only in generic smoke suites or as setup inside another operation's tests. If an operation has separate command, CLI, HTTP/oRPC, Web, or future MCP entrypoints, split the matrix rows and automated tests by those boundaries when each has distinct transport behavior to verify.

When a behavior is owned by a specific aggregate or resource, Web closure should include an owner-scoped affordance on the relevant detail page, not only a standalone admin page, unless the governing spec explicitly makes the operation global-only.

After implementation, run Post-Implementation Sync for the same behavior before recommending or starting another behavior.

### 5. Sync Round

Use when implementation, specs, tests, or entrypoints have drifted.

Do this:

- compare the governing specs and test matrix against code and tests;
- decide whether code should change, specs should change, tests should change, or an ADR is needed first;
- reconcile command/event/workflow/error docs with actual intended behavior;
- reconcile tests with the test matrix;
- keep legacy gaps explicit in migration notes instead of hiding drift.

### 6. Next Behavior Selection

Use when the current behavior is implemented or basically implemented and the user asks what to do next.

Do this:

- verify whether the current behavior completed Post-Implementation Sync;
- rank candidates by v1 minimum-loop value, not just implementation ease;
- start candidate discovery from `docs/BUSINESS_OPERATION_MAP.md`;
- prefer behaviors with Accepted ADRs, global-contract coverage, local specs, implementation plans, and a verifiable minimal deliverable;
- identify blockers that require Spec Round before Code Round;
- recommend exactly one next behavior and list backup candidates.

Output must include:

- recommended next behavior;
- why this behavior matters to the v1 loop;
- next round type: Spec Round or Code Round;
- governed ADRs, global contracts, local specs, and implementation plan;
- backup candidates and why they rank lower.

Do not start writing the next spec or implementing the next behavior unless the current prompt explicitly asks to do so.

### 7. Post-Implementation Sync

Use immediately after a Code Round or when the user asks whether a behavior is implemented enough.

Check:

- code aligns with command/query spec;
- code aligns with workflow spec;
- error mapping aligns with error spec and neverthrow conventions;
- tests align with the test matrix, including matrix ids and matching automated test names;
- intentionally test-first failures are either resolved by Code Round or listed as remaining gaps;
- Web/API/CLI entrypoints dispatch through the intended command/query schemas and buses;
- migration gaps are updated;
- Open Questions are resolved, still valid, or need ADR escalation.

Output must include:

- `aligned` or `not aligned`;
- remaining gaps;
- required doc/test/code updates;
- whether a new ADR is needed;
- whether the behavior is ready to move on from.

## Fixed Workflow

### Step 1. Identify Behavior

Determine whether the user has specified a behavior.

If the behavior is not specified:

- enter Discover mode;
- do not guess and edit;
- return candidate behaviors and ask the user to choose.

If the behavior is specified:

- normalize the behavior name;
- identify likely command/query name;
- identify local spec paths, event names, workflow name, error spec, test matrix, implementation plan, and code modules.

### Step 2. Load Governing Documents

Read governing documents in source-of-truth order:

- `AGENTS.md`;
- `docs/decisions/README.md`;
- relevant ADRs;
- `docs/BUSINESS_OPERATION_MAP.md`;
- `docs/CORE_OPERATIONS.md`;
- `docs/DOMAIN_MODEL.md`;
- global error/neverthrow/async contracts;
- local command/event/workflow/error/testing specs;
- implementation plan;
- `packages/application/src/operation-catalog.ts`.

Use `rg` and `rg --files` first for discovery.

### Step 3. Build Behavior Change Map

Build and share or use a behavior change map before edits when the task is non-trivial.

Include:

- governed ADRs;
- operation-map position and state;
- governed global contracts;
- relevant command specs;
- relevant event specs;
- relevant workflow specs;
- relevant error specs;
- relevant testing specs/test matrix, including test case ids and preferred automation levels;
- implementation plan;
- related code modules;
- related read models/projections and query handlers;
- related Web/API/CLI entrypoints;
- related operation catalog entries.

Use `CHECKLIST.md` for a compact checklist.

### Step 4. Decide Scope

State or infer the round:

- Discover Round when no behavior is selected;
- Spec Round when docs-only, ADR-first, implementation plan work is requested, or governance is incomplete;
- Test-First Round when executable tests are requested before business implementation and the matrix/specs are clear;
- Code Round when code is explicitly allowed and specs are clear;
- Sync Round when reconciling drift;
- Next Behavior Selection when choosing the next v1 behavior after an implemented behavior;
- Post-Implementation Sync when checking an implemented behavior against specs/tests/contracts.

Do not chain multiple round types in one turn unless the prompt explicitly requests it. Exception: a Code Round must finish with Post-Implementation Sync for the same behavior.

Before code changes, decide whether the task first needs:

- a new or updated ADR;
- a new or updated command/event/workflow/error spec;
- a new or updated test matrix with stable case ids and preferred automation levels;
- new or updated automated tests that bind to the changed matrix ids;
- a new or updated implementation plan.

Enter Code Round only if the candidate behavior has:

- relevant Accepted ADRs or no ADR-needed boundary change;
- global-contract coverage for errors/neverthrow/async when applicable;
- local command/query, event, workflow, error, and testing specs where relevant;
- automated tests for the changed matrix ids, or a documented reason they must be created inside the Code Round;
- an implementation plan or an explicitly small enough implementation scope;
- no unresolved Open Questions that would change command boundary, ownership, lifecycle, retry, readiness, durable state, or route/domain/TLS semantics.

If any of these are missing, enter Spec Round first.

### Step 5. Execute

If Spec Round:

- edit only allowed Markdown files;
- update source-of-truth body text directly when the decision is accepted;
- do not scatter analysis labels like `Current fact`, `Inference`, or `Target recommendation` through normative body text;
- keep implementation reality in migration gaps.

If Test-First Round:

- update the governing test matrix first when new or changed behavior lacks numbered rows;
- implement automated tests before business implementation and name each test with the governing matrix id;
- allow tests to fail only as executable target behavior for a future Code Round;
- do not change production/business code, except for test fixtures or test harness wiring;
- report failing matrix ids and the intended Code Round target.

If Code Round:

- implement the smallest behavior slice across core/application/adapters/transports;
- keep CLI as a frontend-like input collection flow, not an afterthought;
- keep Web/API/CLI differences at the entry boundary and converge on shared command/query semantics;
- include the read/query path and relevant user-facing entrypoint needed for a minimal closed loop unless the governing spec explicitly scopes them out;
- update tests according to the behavior test matrix;
- prefer executable e2e/acceptance tests through CLI or HTTP/oRPC for complete command/workflow chains, then add integration and unit tests for branch coverage, pure domain rules, and fast diagnostics;
- include the governing test case id in every automated test name that implements a matrix row, for example `test("[QUICK-DEPLOY-WF-001] accepts existing-context quick deploy through CLI", ...)`;
- update docs only when behavior meaning, gaps, or coverage changed.
- run Post-Implementation Sync for the same behavior before final output.

If Next Behavior Selection:

- inspect `docs/BUSINESS_OPERATION_MAP.md`, `docs/PRODUCT_ROADMAP.md`, `docs/CORE_OPERATIONS.md`, operation catalog, ADRs, local specs, and implementation plans;
- prefer behaviors on the v1 loop: SSH server setup, app deployment, basic access path, domain/TLS, status/error/event visibility;
- choose Code Round only when ADR/spec/plan readiness is sufficient;
- otherwise recommend Spec Round.

If Post-Implementation Sync:

- compare implementation, tests, entrypoints, and migration notes against the governing specs;
- verify every new or changed test matrix row has a stable id, preferred automation level, and matching automated test name when implemented;
- verify test-first failures are resolved or still listed as blockers;
- report ready/not-ready and blockers without starting the next behavior.

### Step 6. Output

Use `OUTPUT_TEMPLATE.md` for the final response shape.

The final response must include:

- round type;
- target behavior;
- operation-map position and state;
- changed docs;
- changed code modules;
- changed tests;
- covered or missing test matrix ids;
- intentionally failing test-first matrix ids when present;
- changed Web/API/CLI entrypoints;
- governed ADRs;
- remaining migration gaps;
- remaining open questions;
- whether the behavior is now fully aligned with the spec.
- recommended next behavior and next round type when relevant.

## ADR Escalation

Create or update an ADR before local specs or code when a change touches:

- command boundary;
- ownership scope;
- lifecycle stages;
- readiness rule;
- retry semantics;
- durable state shape;
- route/domain/TLS boundary;
- long-running async acceptance semantics.

Do not resolve these boundary questions by only changing a local spec or implementation.

## Synchronization Surface

When a behavior changes, check and synchronize:

- business operation map;
- command spec and command implementation;
- query spec/read model/projection when the behavior has observable state;
- event specs and event publisher/consumer behavior;
- workflow spec and process manager/worker behavior;
- error spec and neverthrow return shape;
- testing spec/test matrix ids, preferred automation levels, and actual tests with matching names;
- Web entrypoint;
- HTTP API/oRPC route and input schema;
- CLI command/interactive flow;
- implementation plan;
- ADRs when boundaries change.

## Bundled Templates

- `DISCOVERY_TEMPLATE.md`: use when behavior is not yet selected.
- `CHECKLIST.md`: use to build the behavior change map and coverage checklist.
- `OUTPUT_TEMPLATE.md`: use for final response summaries.
