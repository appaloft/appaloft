# Round Details

Load this reference after the behavior dossier exists and before editing files for a specific round.

## Contents

- Todo gate
- Discover Round
- Spec Round
- Docs Round
- Test-First Round
- Code Round
- Sync Round
- Next Behavior Selection
- Post-Implementation Sync
- Entrypoint surface gate
- ADR escalation
- Synchronization surface

## Todo Gate

Before any non-trivial edit, create a round-specific todo with concrete exit criteria. Use the planning/todo tool if available. Otherwise write a compact checklist in working notes.

Todo rules:

- Do not edit files until the current round has a todo.
- When chaining authorized rounds, create a top-level chain todo first, then refresh the detailed todo before each round.
- Phrase every item as an observable outcome.
- Mark items complete as they finish.
- Add newly discovered required surfaces immediately.
- Do not start the next round while mandatory items remain unchecked unless moved to documented migration gaps or a later authorized round.
- Include test matrix ids whenever tests or e2e/acceptance coverage are in scope.

Minimum todo contents by round:

| Round | Required outcomes |
| --- | --- |
| Spec Round | Governing docs read, behavior map position, ADR need/no-need decision, affected command/event/workflow/error/testing/docs, implementation plan, migration-gap updates. |
| Docs Round | Public docs ADR/spec/test matrix read, target page or stable anchor, Web/CLI/API/future MCP help surfaces, locale state, search aliases, agent-readable docs impact, migration-gap updates. |
| Test-First Round | Numbered matrix rows, automation level for each row, CLI or HTTP/oRPC e2e/acceptance row or exception, lower-level rows, test filenames, expected failing/passing state. |
| Code Round | Core/application/persistence/read model/event/error changes, Web/API/CLI entrypoints, public docs requirement, operation catalog/CORE_OPERATIONS sync, e2e closure path, verification commands. |
| Post-Implementation Sync | Spec alignment, workflow alignment, error alignment, test matrix alignment, public docs alignment, bus/schema alignment, migration gaps, Open Questions/ADR decision, ready/not-ready result. |

## Discover Round

Use when the behavior is not selected.

Do this:

- Read `docs/BUSINESS_OPERATION_MAP.md`, `docs/CORE_OPERATIONS.md`, `packages/application/src/operation-catalog.ts`, and `docs/commands/**`.
- Search for user terms across command specs, workflow specs, event specs, and operation catalog entries.
- List the most relevant candidate behaviors.
- Include each candidate's command name, workflow/spec paths, and one-line rationale.
- Ask the user to pick one candidate before editing code or specs.

Do not edit code or specs. Do not guess a behavior and proceed.

## Spec Round

Use for Markdown/spec work, ADR work, implementation planning, readiness preparation, or incomplete governance.

Do this:

- Update ADRs first when boundaries or lifecycle rules change.
- Update `docs/BUSINESS_OPERATION_MAP.md` first when a behavior is new, absent, repositioned, or rebuild-required.
- Keep spec bodies source-of-truth / Normative Contract style.
- Put current implementation reality only in `Current Implementation Notes And Migration Gaps`.
- Put undecided issues only in `Open Questions`.
- Update related command, event, workflow, error, testing, documentation, and implementation plan docs together.
- Use the dossier's `ADDED`, `MODIFIED`, `REMOVED`, `RENAMED` intent to keep edits focused.

Do not change business code, tests, package files, or config in Spec Round.

## Docs Round

Use for public documentation, docs platform governance, help anchors, or user-visible behavior closure.

Do this:

- Read `docs/decisions/ADR-030-public-documentation-round-and-platform.md`, `docs/documentation/public-docs-structure.md`, and `docs/testing/public-documentation-test-matrix.md`.
- Decide whether the behavior needs a public task page, concept page, reference page, troubleshooting page, stable anchor on an existing page, not-user-facing reason, or explicit migration gap.
- Document Web, CLI, HTTP/oRPC, repository config, and future MCP/tool help surfaces when relevant.
- Keep public docs task-oriented and avoid internal DDD/CQRS implementation terms in primary user journeys.
- Define stable explicit anchors for product help links.
- Record locale state for `zh-CN` and `en-US`, search aliases, and agent-readable docs impact.

Do not change business code or tests in Docs Round. Docs platform scaffolding belongs to a later Code Round unless explicitly authorized.

## Test-First Round

Use when executable expectations should be created before business code.

Do this:

- Update the governing `docs/testing/**` matrix before writing tests if changed behavior lacks numbered rows.
- Implement or rename automated tests so each changed matrix row has a matching test name with the matrix id.
- For every new or changed command, add at least one executable CLI or HTTP/oRPC e2e/acceptance test that proves the command can be executed from a user-facing entrypoint and observed through a public read/query surface, unless the matrix documents an exception.
- Add integration/unit rows underneath for event payloads, persistence state, workflow branches, adapter behavior, and pure domain rules.
- Classify rows by the strongest boundary that can observe the assertion: `e2e-preferred`, `integration`, `unit`, or `contract`.
- Allow intentionally failing tests only when they express target behavior from the governing specs.

Do not change production/business code except for test fixtures or test harness wiring. Output failing matrix ids and expected Code Round work.

## Code Round

Use only when implementation is allowed and governance is sufficient.

Enter Code Round only if:

- relevant Accepted ADRs exist, or no ADR-needed boundary change is present;
- global contracts cover error/neverthrow/async concerns when applicable;
- local command/query, event, workflow, error, and testing specs exist where relevant;
- public documentation requirement is decided when user-visible;
- automated tests for changed matrix ids exist, or the matrix documents why they must be created inside Code Round;
- implementation plan exists, or scope is explicitly small enough;
- no unresolved Open Questions would change command boundary, ownership, lifecycle, retry, readiness, durable state, or route/domain/TLS semantics.

Do this:

- Implement the smallest coherent behavior slice.
- Keep CLI as a frontend-like input collection flow, not an afterthought.
- Keep Web/API/CLI differences at the entry boundary and converge on shared command/query semantics.
- Include the read/query path and relevant user-facing entrypoint needed for a minimal closed loop unless explicitly scoped out.
- Update tests according to the behavior test matrix.
- Include matrix ids in automated test names, for example `test("[QUICK-DEPLOY-WF-001] accepts existing-context quick deploy through CLI", ...)`.
- Update docs only when behavior meaning, gaps, or coverage changed.
- Run Post-Implementation Sync before final output.

Do not treat a write-side command as complete if the only confirmation path is manual persistence inspection.

## Sync Round

Use when implementation, specs, tests, docs, or entrypoints drift.

Do this:

- Compare governing specs and test matrix against code and tests.
- Decide whether code should change, specs should change, tests should change, docs should change, or an ADR is needed first.
- Reconcile command/event/workflow/error docs with intended behavior.
- Reconcile tests with the test matrix.
- Keep legacy gaps explicit in migration notes.

## Next Behavior Selection

Use when the current behavior is implemented or basically implemented and the user asks what to do next.

Do this:

- Verify whether the current behavior completed Post-Implementation Sync.
- Inspect `docs/BUSINESS_OPERATION_MAP.md`, `docs/PRODUCT_ROADMAP.md`, `docs/CORE_OPERATIONS.md`, operation catalog, ADRs, local specs, and implementation plans.
- Prefer behaviors on the v1 loop: SSH server setup, app deployment, basic access path, domain/TLS, status/error/event visibility.
- Choose Code Round only when ADR/spec/plan readiness is sufficient; otherwise recommend Spec Round.
- Recommend exactly one next behavior and list backup candidates.

Do not start the next behavior unless explicitly requested.

## Post-Implementation Sync

Use after Code Round or when asked whether a behavior is implemented enough.

Do this:

- Load `references/verification.md`.
- Compare implementation, tests, entrypoints, public docs, and migration notes against governing specs.
- Verify every changed matrix row has a stable id, preferred automation level, and matching automated test name when implemented.
- Verify every new or changed command has a passing CLI or HTTP/oRPC e2e/acceptance test, or explicit test-matrix exception.
- Verify user-visible behavior has a public docs anchor, an existing docs coverage decision, a not-user-facing reason, or explicit docs migration gap.
- Verify test-first failures are resolved or still listed as blockers.
- Report ready/not-ready and blockers without starting the next behavior.

## Entrypoint Surface Gate

When a behavior becomes user-visible or changes user-controlled input, treat these as separate surfaces over the same operation:

- Web
- CLI
- API/oRPC
- repository config files
- public documentation
- future MCP/tool entrypoints

For each relevant surface, decide one state:

- implemented input or selection affordance;
- read-only/status-only affordance;
- intentionally not applicable, with domain reason;
- deferred migration gap, with missing schema/command/UI work named.

Do not call a behavior fully exposed if only one surface can accept the new input while another first-class surface for the same workflow silently cannot.

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
- event specs and publisher/consumer behavior;
- workflow spec and process manager/worker behavior;
- error spec and neverthrow return shape;
- testing spec/test matrix ids, preferred automation levels, and actual tests with matching names;
- Web entrypoint;
- HTTP API/oRPC route and input schema;
- CLI command/interactive flow;
- repository config field names and validation;
- public documentation page, stable help anchor, locale state, search aliases, and agent-readable docs impact;
- implementation plan;
- ADRs when boundaries change;
- operation catalog and `docs/CORE_OPERATIONS.md` for new business capabilities.
