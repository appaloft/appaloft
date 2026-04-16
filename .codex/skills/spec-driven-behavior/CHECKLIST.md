# Behavior Change Checklist

Use this checklist after the behavior is identified.

## Governance

- [ ] `AGENTS.md` read
- [ ] `docs/decisions/README.md` read
- [ ] Relevant ADRs read
- [ ] `docs/BUSINESS_OPERATION_MAP.md` read and behavior located
- [ ] `docs/errors/model.md` read
- [ ] `docs/errors/neverthrow-conventions.md` read
- [ ] `docs/architecture/async-lifecycle-and-acceptance.md` read
- [ ] `docs/CORE_OPERATIONS.md` read when adding/changing a business capability
- [ ] `packages/application/src/operation-catalog.ts` read when adding/changing a business capability

## Behavior Change Map

- Behavior:
- Operation-map position/state:
- Command/query:
- Current round:
- Requested/allowed file scope:
- Code changes allowed:
- Governed ADRs:
- Global contracts:
- Command specs:
- Event specs:
- Workflow specs:
- Error specs:
- Testing specs/test matrices:
- Implementation plans:
- Core modules:
- Application modules:
- Persistence modules:
- Read models/projections:
- Runtime/provider/integration modules:
- Web entrypoints:
- HTTP/API/oRPC entrypoints:
- CLI entrypoints:

## Boundary Checks

- [ ] Command boundary unchanged or ADR updated
- [ ] Ownership scope unchanged or ADR updated
- [ ] Lifecycle/readiness/retry semantics unchanged or ADR updated
- [ ] Durable state shape unchanged or ADR updated
- [ ] Route/domain/TLS boundary unchanged or ADR updated
- [ ] Async acceptance semantics unchanged or ADR updated

## Round Gate

- [ ] Defaulted to Spec Round when governance is incomplete
- [ ] Behavior is positioned in `docs/BUSINESS_OPERATION_MAP.md`
- [ ] Rebuild-required behavior has ADR/spec/test matrix/implementation plan before Code Round
- [ ] Code Round explicitly allowed by the prompt
- [ ] Accepted ADRs present, or no ADR-needed boundary change
- [ ] Global contracts cover error/neverthrow/async concerns
- [ ] Local specs cover command/query, workflow, error, testing, and events when applicable
- [ ] Implementation plan exists, or scope is explicitly small enough
- [ ] Open Questions do not block command boundary, ownership, lifecycle, retry, readiness, durable state, or route/domain/TLS semantics

## Per-Round Todo Gate

- [ ] Current round has a concrete todo before file edits
- [ ] Chained rounds have separate Spec/Test-First/Code/Post-Implementation todo sections
- [ ] Todo items use observable outcomes, not vague activities
- [ ] Newly discovered required surfaces were added to the todo immediately
- [ ] Unchecked mandatory items are completed, moved to an authorized later round, or documented as migration gaps
- [ ] Test-related todo items include stable matrix ids

### Spec Round Todo Minimum

- [ ] Governing docs read
- [ ] Behavior located or positioned in `docs/BUSINESS_OPERATION_MAP.md`
- [ ] ADR need/no-need decision recorded
- [ ] Command/query specs updated when semantics change
- [ ] Event specs updated when emitted/consumed events change
- [ ] Workflow specs updated when lifecycle sequencing changes
- [ ] Error specs updated when error codes/phases change
- [ ] Test matrix rows added/updated before tests
- [ ] Implementation plan added/updated when Code Round will follow
- [ ] Migration gaps/Open Questions updated

### Test-First Round Todo Minimum

- [ ] Numbered matrix rows exist for every changed scenario
- [ ] Automation level selected for every changed matrix row
- [ ] Every new/changed command has at least one CLI or HTTP/oRPC e2e/acceptance row, or a documented exception
- [ ] Lower-level integration/unit rows cover event payloads, persistence details, branches, and pure domain rules
- [ ] Automated test filenames selected
- [ ] Automated test names include matrix ids
- [ ] Expected failing/passing state recorded before Code Round

### Code Round Todo Minimum

- [ ] Core/domain transition changes
- [ ] Application command/query/use-case/handler changes
- [ ] Persistence/read model/projection changes when observable state changes
- [ ] Event and error mapping changes
- [ ] Operation catalog and `docs/CORE_OPERATIONS.md` sync
- [ ] CLI entrypoint dispatches through the command/query bus
- [ ] API/oRPC entrypoint reuses the command/query schema
- [ ] Web entrypoint and owner-scoped affordance when applicable
- [ ] E2E/acceptance closure path passes through public read/query observability
- [ ] Verification commands selected and run

### Post-Implementation Sync Todo Minimum

- [ ] Command/query code aligns with spec
- [ ] Workflow/process behavior aligns with spec
- [ ] Error mapping aligns with error spec and neverthrow conventions
- [ ] Tests align with matrix ids and automation levels
- [ ] Every new/changed command has passing CLI or HTTP/oRPC e2e/acceptance coverage, or a documented exception
- [ ] Web/API/CLI entrypoints dispatch through shared schemas and buses
- [ ] Migration gaps updated
- [ ] Open Questions resolved, retained, or escalated to ADR
- [ ] Behavior ready/not-ready decision recorded

## Coverage Checks

- [ ] Command
- [ ] Query/read model
- [ ] Event
- [ ] Workflow
- [ ] Error contract
- [ ] Test matrix
- [ ] Actual tests
- [ ] Web entry
- [ ] Owner-scoped Web affordance when the behavior belongs to a resource or aggregate
- [ ] API/oRPC entry
- [ ] CLI interaction
- [ ] Implementation plan

## Post-Implementation Sync

- [ ] Command/query code aligns with spec
- [ ] Business operation map still matches the implemented behavior state
- [ ] Workflow/process behavior aligns with spec
- [ ] Error mapping aligns with error spec and neverthrow conventions
- [ ] Tests align with test matrix
- [ ] Web/API/CLI dispatch through shared operation schemas and buses
- [ ] Migration gaps updated
- [ ] Open Questions resolved, retained, or escalated to ADR
- [ ] Behavior ready/not-ready decision recorded

## Next Behavior Selection

- [ ] Current behavior completed Post-Implementation Sync
- [ ] Candidates ranked by v1 minimum loop value
- [ ] Recommended next behavior has round type: Spec Round or Code Round
- [ ] Recommendation lists governed ADRs/specs/plans
- [ ] Backup candidates listed
- [ ] No next behavior executed unless explicitly requested
