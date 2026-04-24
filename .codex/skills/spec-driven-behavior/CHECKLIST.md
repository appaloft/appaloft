# Behavior Dossier Checklist

Use this checklist after the behavior is identified. Keep it current while the round is active.

## Governance

- [ ] `AGENTS.md` read
- [ ] `docs/decisions/README.md` read
- [ ] Relevant ADRs read
- [ ] `docs/BUSINESS_OPERATION_MAP.md` read and behavior located
- [ ] `docs/CORE_OPERATIONS.md` read when adding/changing a business capability
- [ ] `docs/DOMAIN_MODEL.md` read when aggregate/resource ownership is relevant
- [ ] `docs/errors/model.md` read
- [ ] `docs/errors/neverthrow-conventions.md` read
- [ ] `docs/architecture/async-lifecycle-and-acceptance.md` read
- [ ] `packages/application/src/operation-catalog.ts` read when adding/changing a business capability

## Behavior Dossier

- Behavior:
- Operation/catalog name:
- Operation-map position/state:
- Current round:
- Execution mode: incremental readiness | complete readiness
- Requested/allowed file scope:
- Code changes allowed:
- Public/user-visible:
- Governed ADRs:
- Global contracts:
- Command/query specs:
- Event specs:
- Workflow specs:
- Error specs:
- Testing specs/test matrix ids:
- Implementation plan:
- Public docs page/stable anchor:
- Core modules:
- Application modules:
- Persistence modules:
- Read models/projections:
- Runtime/provider/integration modules:
- Web entrypoints:
- HTTP/API/oRPC entrypoints:
- CLI entrypoints:
- Repository config fields:
- Future MCP/tool surfaces:
- Remaining migration gaps:
- Open questions:

## Artifact State

Use `done`, `ready`, `blocked`, `not-applicable`, or `deferred-gap`.

| Artifact | State | Evidence / blocker |
| --- | --- | --- |
| Behavior identity and operation-map position |  |  |
| ADR/global-contract decision |  |  |
| Local command/query/event/workflow/error specs |  |  |
| Public docs outcome and stable help anchor |  |  |
| Test matrix rows and automation levels |  |  |
| Implementation plan or small-scope rationale |  |  |
| Automated tests bound to matrix ids |  |  |
| Code/read model/entrypoint implementation |  |  |
| Post-Implementation Sync verification report |  |  |

## Change Intent

Use this to focus brownfield edits. Apply accepted intent directly to source-of-truth docs/code/tests.

### ADDED

- Requirement:
- Scenario:
- Matrix row:
- Entrypoint:
- Public docs anchor:
- Operation catalog entry:

### MODIFIED

- Requirement:
- Scenario:
- Matrix row:
- Entrypoint:
- Public docs anchor:
- Operation catalog entry:

### REMOVED

- Requirement:
- Scenario:
- Matrix row:
- Entrypoint:
- Public docs anchor:
- Operation catalog entry:
- Reason:
- Migration:

### RENAMED

- From:
- To:
- Affected docs/code/tests:

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
- [ ] Code Round explicitly allowed by the prompt before business code changes
- [ ] Accepted ADRs present, or no ADR-needed boundary change
- [ ] Global contracts cover error/neverthrow/async concerns
- [ ] Local specs cover command/query, workflow, error, testing, and events when applicable
- [ ] Public docs outcome decided for user-visible behavior
- [ ] Implementation plan exists, or scope is explicitly small enough
- [ ] Open Questions do not block command boundary, ownership, lifecycle, retry, readiness, durable state, or route/domain/TLS semantics

## Per-Round Todo Gate

- [ ] Current round has a concrete todo before file edits
- [ ] Chained rounds have separate Spec/Docs/Test-First/Code/Post-Implementation todo sections
- [ ] Todo items use observable outcomes, not vague activities
- [ ] Newly discovered required surfaces were added to the todo immediately
- [ ] Unchecked mandatory items are completed, moved to an authorized later round, or documented as migration gaps
- [ ] Test-related todo items include stable matrix ids

### Spec Round Todo Minimum

- [ ] Governing docs read
- [ ] Behavior located or positioned in `docs/BUSINESS_OPERATION_MAP.md`
- [ ] ADR need/no-need decision recorded
- [ ] Change intent recorded as ADDED/MODIFIED/REMOVED/RENAMED
- [ ] Command/query specs updated when semantics change
- [ ] Event specs updated when emitted/consumed events change
- [ ] Workflow specs updated when lifecycle sequencing changes
- [ ] Error specs updated when error codes/phases change
- [ ] Test matrix rows added/updated before tests
- [ ] Implementation plan added/updated when Code Round will follow
- [ ] Public docs outcome added/updated when user-visible
- [ ] Migration gaps/Open Questions updated

### Docs Round Todo Minimum

- [ ] ADR-030, public docs structure, and public docs test matrix read
- [ ] Target public page, stable anchor, not-user-facing reason, or migration gap decided
- [ ] Web `?`, CLI help/docs, HTTP/API, repository config, and future MCP/tool docs surfaces decided
- [ ] Locale state for `zh-CN` and `en-US` recorded
- [ ] Search aliases and agent-readable docs impact recorded
- [ ] Public docs migration gaps updated

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

- [ ] Completeness checked
- [ ] Correctness checked
- [ ] Coherence checked
- [ ] Command/query code aligns with spec
- [ ] Workflow/process behavior aligns with spec
- [ ] Error mapping aligns with error spec and neverthrow conventions
- [ ] Tests align with matrix ids and automation levels
- [ ] Every new/changed command has passing CLI or HTTP/oRPC e2e/acceptance coverage, or a documented exception
- [ ] Web/API/CLI entrypoints dispatch through shared schemas and buses
- [ ] Public docs outcome exists for user-visible behavior
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
- [ ] Repository config fields
- [ ] Future MCP/tool surface
- [ ] Public docs/help anchor
- [ ] Operation catalog
- [ ] `docs/CORE_OPERATIONS.md`
- [ ] Implementation plan

## Verification Summary

| Dimension | Status | CRITICAL | WARNING | SUGGESTION |
| --- | --- | --- | --- | --- |
| Completeness |  |  |  |  |
| Correctness |  |  |  |  |
| Coherence |  |  |  |  |

## Next Behavior Selection

- [ ] Current behavior completed Post-Implementation Sync
- [ ] Candidates ranked by v1 minimum loop value
- [ ] Recommended next behavior has round type: Spec Round or Code Round
- [ ] Recommendation lists governed ADRs/specs/plans
- [ ] Backup candidates listed
- [ ] No next behavior executed unless explicitly requested
