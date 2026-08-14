# Tasks: Production Failure-Domain Resilience

## Governance

- [x] Complete owner-authorized Grill and accept ADR-115, Spec 137, plan and Test Matrix.
- [x] Merge R6 governance and create actor-visible public/Cloud R6a tracking Tickets.

## R6a Failure-Domain Admission

- [x] RED `RESIL-FD-001`–`RESIL-DECIDE-003` for validation, missing/shared-domain blockers and deterministic evidence.
- [x] Implement public target/intent/decision failure-domain contracts and placement rules.
- [x] Synchronize contracts, fake connector and all affected fixtures without compatibility inference.
- [x] Adopt through Cloud policy/readback/persistence and run public/private Boundary Review.

## R6b1 Independent Replacement Readiness

- [ ] Merge the R6b1 Grill/Spec/ADR/Test Matrix clarification and create public/Cloud `ready-for-agent` Tickets.
- [ ] RED `RESIL-READY-004` at the public target-pool, connector plan, contract and Web seams.
- [ ] Implement typed `ready`/`blocked` evidence and a plan-only `infrastructure.cluster.readiness` capability.
- [ ] Adopt through Cloud tenant policy/inventory composition without provider or mutation effects.
- [ ] Merge public first, update the Cloud pin, run full gates and independent Boundary Review.

## R6b2–R6d

- [ ] Implement managed-cell import/provision, inspect, drain/delete and exact capacity dry-run/readback.
- [ ] Implement accepted-plan fenced traffic handoff `RESIL-FENCE-005`–`RESIL-ROUTE-006`.
- [ ] Implement state eligibility and DR evidence `RESIL-STATE-007`.
- [ ] Prove exact rollback/cleanup `RESIL-CLEAN-008`.

## External Acceptance And Sync

- [ ] Produce redacted provider plan with exact regions, capacity, HA, traffic, cost and cleanup.
- [ ] Obtain separate owner approval before paid resources, DNS or traffic mutation.
- [ ] Run `RESIL-E2E-009`, independent residual readback, full gates, docs impact and Boundary Review.
- [ ] Sync claims and close R6 only after R6a–R6d and the real packet pass.
