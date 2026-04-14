# Behavior Change Checklist

Use this checklist after the behavior is identified.

## Governance

- [ ] `AGENTS.md` read
- [ ] `docs/decisions/README.md` read
- [ ] Relevant ADRs read
- [ ] `docs/errors/model.md` read
- [ ] `docs/errors/neverthrow-conventions.md` read
- [ ] `docs/architecture/async-lifecycle-and-acceptance.md` read
- [ ] `docs/CORE_OPERATIONS.md` read when adding/changing a business capability
- [ ] `packages/application/src/operation-catalog.ts` read when adding/changing a business capability

## Behavior Change Map

- Behavior:
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
- [ ] Code Round explicitly allowed by the prompt
- [ ] Accepted ADRs present, or no ADR-needed boundary change
- [ ] Global contracts cover error/neverthrow/async concerns
- [ ] Local specs cover command/query, workflow, error, testing, and events when applicable
- [ ] Implementation plan exists, or scope is explicitly small enough
- [ ] Open Questions do not block command boundary, ownership, lifecycle, retry, readiness, durable state, or route/domain/TLS semantics

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
