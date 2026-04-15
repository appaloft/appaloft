# AI Agent Documentation Map

> Analysis date: 2026-04-13.
>
> Purpose: give future agents a stable entry point for command-first, event-aware, async-aware,
> error-first analysis and documentation work. These files describe the current codebase reality
> first, then the target documentation shape.

## Read Order

1. [`../decisions/README.md`](../decisions/README.md)
   - Source-of-truth decision records for blocking command/workflow/error/testing choices.
   - Read the relevant ADRs before interpreting local specs.
2. Relevant ADRs in [`../decisions/`](../decisions/)
   - For deployments: read ADR-001, ADR-010, ADR-014, ADR-015, and ADR-016.
   - For routing/domain/TLS: read ADR-002 and ADR-005 through ADR-009.
   - For server bootstrap: read ADR-003 and ADR-004.
3. [`../BUSINESS_OPERATION_MAP.md`](../BUSINESS_OPERATION_MAP.md)
   - Source of truth for how commands, queries, workflows, events, read models, and rebuild gates relate.
   - Before adding or changing a behavior, locate it here first.
4. [`../CORE_OPERATIONS.md`](../CORE_OPERATIONS.md)
   - Human and AI source of truth for the active business operation surface.
   - Must stay in lockstep with `packages/application/src/operation-catalog.ts`.
5. [`../DOMAIN_MODEL.md`](../DOMAIN_MODEL.md)
   - Human and AI source of truth for bounded contexts, aggregates, and ubiquitous language.
6. [`../errors/model.md`](../errors/model.md)
   - Shared error categories, logical fields, consumer mappings, and test expectations.
7. [`../errors/neverthrow-conventions.md`](../errors/neverthrow-conventions.md)
   - Shared Result / Promise<Result> / ResultAsync conventions and throw boundaries.
8. [`../architecture/async-lifecycle-and-acceptance.md`](../architecture/async-lifecycle-and-acceptance.md)
   - Shared accepted-request, post-acceptance failure, retry, terminal/degraded/readiness semantics.
9. Local command/event/error/workflow/testing specs
   - Read the local spec for the operation being changed after decisions and global contracts.
10. [`../PRODUCT_ROADMAP.md`](../PRODUCT_ROADMAP.md)
   - Yundu product roadmap for resource lifecycle, deployment, routing, TLS, operations, and platform depth.
11. [`CURRENT_STATE.md`](./CURRENT_STATE.md)
   - Reverse-engineered command, event, async, error, neverthrow, and testing state.
12. [`SPEC_PLANNING.md`](./SPEC_PLANNING.md)
   - Recommended documentation tree and ownership rules for evolving specs.
13. [`GAP_ANALYSIS.md`](./GAP_ANALYSIS.md)
   - Current implementation gaps, priority, and gradual correction route.
14. [`EXAMPLE_SPECS.md`](./EXAMPLE_SPECS.md)
   - Lightweight example drafts for `deployments.create` and server edge proxy bootstrap.

## Template Entry Points

- Command specs: [`../commands/_TEMPLATE.md`](../commands/_TEMPLATE.md)
- Event specs: [`../events/_TEMPLATE.md`](../events/_TEMPLATE.md)
- Error specs: [`../errors/_TEMPLATE.md`](../errors/_TEMPLATE.md)
- Workflow specs: [`../workflows/_TEMPLATE.md`](../workflows/_TEMPLATE.md)
- Spec-driven tests: [`../testing/SPEC_DRIVEN_TESTING.md`](../testing/SPEC_DRIVEN_TESTING.md)

## Grounding Rules For Agents

- Read `docs/decisions/README.md` and relevant ADRs before reading local specs.
- Read global contracts before local specs:
  - `docs/errors/model.md`
  - `docs/errors/neverthrow-conventions.md`
  - `docs/architecture/async-lifecycle-and-acceptance.md`
- Treat `Current code` as observed facts, not as the final ideal.
- Treat `Recommended target` as a migration direction, not a license for a rewrite.
- Mark uncertain points as `Needs verification`.
- Do not add a new endpoint, CLI command, or UI operation without mapping it to
  `BUSINESS_OPERATION_MAP.md`, `CORE_OPERATIONS.md`, and `operation-catalog.ts`.
- Do not implement a rebuild-required behavior such as deployment cancel/redeploy/rollback before
  it is repositioned in `BUSINESS_OPERATION_MAP.md`, governed by ADR/specs, and planned for code.
- Do not treat UI or CLI input collection as domain truth. Input collection may call commands, but
  the final business operation must still be an explicit command or query.
- Do not treat `DeploymentProgressEvent` as a domain event. It is currently a progress-stream
  event for users and adapters.
- Do not treat event publication as proof that all follow-up work succeeded. Event handling may be
  asynchronous and soft-failing in the current shell event bus.
