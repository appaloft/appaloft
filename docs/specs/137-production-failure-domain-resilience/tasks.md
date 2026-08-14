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

- [x] Merge the R6b1 Grill/Spec/ADR/Test Matrix clarification and create public/Cloud `ready-for-agent` Tickets (#1109 / Cloud #907).
- [x] RED `RESIL-READY-004` at the public target-pool, connector plan, contract and Web seams.
- [x] Implement typed `ready`/`blocked` evidence and a plan-only `infrastructure.cluster.readiness` capability.
- [x] Adopt through Cloud tenant policy/inventory composition without provider or mutation effects; Cloud PR #908 merged to `db83448a`.
- [x] Merge public first, pin Cloud to public `def417be`, run full gates and independent Boundary Review (PASS; no P0/P1/P2).

## R6b2–R6d

- [x] Accept the R6b2 Grill and define managed capacity-cell origin, lifecycle, drain/delete and external-resource retention semantics.
- [x] Create the public R6b2 actor-visible Ticket #1113 and bind `RESIL-CELL-010` / `RESIL-CELLS-011` before Code Round.
- [x] RED managed-cell import/provision, inspect, drain/delete, exact-plan drift and two-cell dry-run/readback.
- [x] Implement the provider-neutral lifecycle contract, fake adapter, shared schema and Web affordance.
- [x] Publish the managed capacity-cell task/help anchor and complete docs impact classification.
- [x] Accept the R6c Grill and define exact endpoints/epochs/token, bounded health, ordered fencing,
  route verification, explicit failback, rollback outcomes and plan-only status readback.
- [x] Create the public R6c actor-visible Ticket #1116 and bind `RESIL-FENCE-005`,
  `RESIL-ROUTE-006` and the R6c portion of `RESIL-CLEAN-008` before Code Round.
- [x] RED core/contract/fake connector/Web tests for handoff/status/failback, stale/no-health
  no-effect, pre-move preservation, post-move rollback and zero residuals.
- [x] Implement provider-neutral traffic contracts and exact connector plan/accept/apply/status.
- [x] Publish the `managed-traffic-handoff` help anchor and complete docs impact classification:
  existing bilingual integrations page, registry topic and high-confusion traceability row.
- [x] Merge public R6c implementation PR #1117 to final `main` `2545cc82`, pass public CI, and
  verify the Cloud injected-port handoff/status/replay/failback/failure packet without external traffic.
- [ ] Implement state eligibility and DR evidence `RESIL-STATE-007`.
- [ ] Prove the remaining R6d/real-packet portion of exact rollback/cleanup `RESIL-CLEAN-008`.

## External Acceptance And Sync

- [ ] Produce redacted provider plan with exact regions, capacity, HA, traffic, cost and cleanup.
- [ ] Obtain separate owner approval before paid resources, DNS or traffic mutation.
- [ ] Run `RESIL-E2E-009`, independent residual readback, full gates, docs impact and Boundary Review.
- [ ] Sync claims and close R6 only after R6a–R6d and the real packet pass.
