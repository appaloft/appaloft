# Tasks: Production Failure-Domain Resilience

## Governance

- [x] Complete owner-authorized Grill and accept ADR-115, Spec 137, plan and Test Matrix.
- [ ] Merge governance and create actor-visible public/Cloud tracking Tickets.

## R6a Failure-Domain Admission

- [ ] RED `RESIL-FD-001`–`RESIL-DECIDE-003` for validation, missing/shared-domain blockers and deterministic evidence.
- [ ] Implement public target/intent/decision failure-domain contracts and placement rules.
- [ ] Synchronize contracts, fake connector and all affected fixtures without compatibility inference.
- [ ] Adopt through Cloud policy/readback/persistence and run public/private Boundary Review.

## R6b–R6d

- [ ] Implement `RESIL-READY-004` independent replacement readiness.
- [ ] Implement accepted-plan fenced traffic handoff `RESIL-FENCE-005`–`RESIL-ROUTE-006`.
- [ ] Implement state eligibility and DR evidence `RESIL-STATE-007`.
- [ ] Prove exact rollback/cleanup `RESIL-CLEAN-008`.

## External Acceptance And Sync

- [ ] Produce redacted provider plan with exact regions, capacity, HA, traffic, cost and cleanup.
- [ ] Obtain separate owner approval before paid resources, DNS or traffic mutation.
- [ ] Run `RESIL-E2E-009`, independent residual readback, full gates, docs impact and Boundary Review.
- [ ] Sync claims and close R6 only after R6a–R6d and the real packet pass.
