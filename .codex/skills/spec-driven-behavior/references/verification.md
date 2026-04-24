# Verification

Use this reference for Post-Implementation Sync, Sync Round, and Code Round closure.

## Verification Dimensions

Report findings under three dimensions:

| Dimension | Validates |
| --- | --- |
| Completeness | Required artifacts exist and required scenarios/tests/entrypoints/docs are covered. |
| Correctness | Implementation behavior matches governing specs, workflows, error contracts, and test matrix rows. |
| Coherence | ADRs, implementation plan, code structure, entrypoint schemas, docs anchors, and migration gaps agree. |

## Severity

Use these severities:

| Severity | Meaning |
| --- | --- |
| `CRITICAL` | Required artifact, required entrypoint, passing required test, or normative behavior is missing. Behavior is `not aligned`. |
| `WARNING` | Behavior can be understood but has drift, weak coverage, incomplete docs, or non-blocking inconsistency. |
| `SUGGESTION` | Cleanup, naming, or maintainability improvement that does not change readiness. |

When uncertain, prefer the lower severity unless a normative spec, test matrix row, or ADR is clearly violated.

## Completeness Checks

Check:

- Behavior exists in `docs/BUSINESS_OPERATION_MAP.md`.
- ADR/global-contract decision is recorded.
- Local command/query, workflow, event, error, and testing specs exist when relevant.
- Public docs outcome exists for user-visible behavior.
- Test matrix rows have stable ids and automation levels.
- Automated tests exist for implemented matrix rows and include matrix ids in names.
- Every new or changed command has a CLI or HTTP/oRPC e2e/acceptance test, or an explicit matrix exception.
- Read/query observability exists for write-side commands unless explicitly scoped out.
- Web/API/CLI/repository config/future MCP surfaces are implemented, not-applicable, or deferred-gap with reasons.
- Operation catalog and `docs/CORE_OPERATIONS.md` are synchronized for new business capabilities.

## Correctness Checks

Check:

- Command/query input schema matches transport input reuse.
- Handlers dispatch through `CommandBus` or `QueryBus` and delegate to use cases/query services.
- Use cases and application services do not embed transport or persistence concerns.
- Workflow sequencing, lifecycle transitions, readiness gates, rollback behavior, retry behavior, and async acceptance match governing specs.
- Error codes, categories, phases, and neverthrow result shapes match error contracts.
- Events are emitted/consumed as specified.
- Read models/projections expose the observable state required by the workflow and tests.
- CLI, HTTP/oRPC, Web, and repository config behavior converge on the same operation semantics.
- Public docs and help anchors describe the actual user-facing behavior.

## Coherence Checks

Check:

- Implementation plan still describes the implemented slice.
- ADR decisions are reflected in local specs and code.
- Migration gaps are explicit and do not weaken normative body text.
- Open Questions are resolved, retained with reason, or escalated to ADR.
- Test automation level matches what can actually observe the assertion.
- `e2e-preferred` is used only for user-observable chains, not hidden repository fields or internal call ordering.
- Operation-named tests exist for explicit operation catalog entries instead of only generic smoke coverage.
- Owner-scoped Web affordances exist when the behavior belongs to a resource or aggregate, unless the spec makes it global-only.

## Verification Report Shape

```markdown
## Verification Report

- Behavior:
- Round:
- Result: aligned | not aligned
- Ready to move on: yes | no

### Completeness
- Status:
- CRITICAL:
- WARNING:
- SUGGESTION:

### Correctness
- Status:
- CRITICAL:
- WARNING:
- SUGGESTION:

### Coherence
- Status:
- CRITICAL:
- WARNING:
- SUGGESTION:

### Required Follow-Up
- Docs:
- Tests:
- Code:
- ADR:
- Migration gaps:
```

## Ready/Not-Ready Rule

Return `aligned` only when:

- no CRITICAL findings remain;
- required tests pass or documented exceptions exist;
- user-visible behavior has a public docs outcome;
- operation catalog, CORE_OPERATIONS, specs, tests, and entrypoints agree;
- migration gaps are explicit and do not contradict normative contracts.

Warnings may remain, but they must be listed with concrete follow-up.

## Graceful Degradation

If only some artifacts exist, verify the strongest available subset and state what was skipped:

- Only specs: verify source-of-truth consistency and missing readiness artifacts.
- Specs plus tests: verify matrix/test binding and expected failing/passing state.
- Specs plus implementation: verify behavior, entrypoints, read/query observability, and migration gaps.
- Full dossier: verify all three dimensions.

Do not hide skipped checks. A skipped required check is usually a CRITICAL gap unless the artifact is not-applicable or deferred-gap.
