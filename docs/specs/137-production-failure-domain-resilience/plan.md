# Plan: Production Failure-Domain Resilience

## Governing Sources

- ADR-023, ADR-114, ADR-115, Spec 136 and Spec 137.
- Existing managed target-pool placement, connector accepted-plan binding, deployment fencing,
  route activation, health/proof and storage backup/restore contracts.

## Architecture

1. Add bounded failure-domain identity and required-separation intent to public managed topology.
2. Make target-pool eligibility compare the current and candidate domain keys and return stable
   safe reasons/evidence.
3. Add a read-only independent replacement readiness result over the same placement model. Expose
   it through `connections.capability.plan` as `infrastructure.cluster.readiness`; blocked capacity
   is typed evidence, while malformed input remains an error.
4. Keep hosted inventory/policy in Cloud and pass only neutral candidate/intent snapshots inward.
5. Reuse accepted connector plans for managed cell lifecycle and route handoff; keep provider SDKs
   in adapters.
6. Gate stateful failover on existing backup/restore or external durability evidence rather than
   copying storage lifecycle.
7. Model a provider-neutral managed capacity-cell lifecycle inside the existing managed-cluster
   connector contract. `provision|import|drain|delete` are exact accepted-plan mutations;
   `inspect` is query-only and returns the same safe lifecycle snapshot used by receipts.
8. Make origin and provider-resource disposition explicit so imported-cell deletion can unregister
   Appaloft capacity without destroying the external cluster.
9. Add provider-neutral managed traffic route, endpoint, bounded health, handoff plan and handoff
   receipt value objects. Route/provider state remains external readback; no new public aggregate,
   repository, table or event is introduced.
10. Extend the managed connector with exact-plan handoff/failback and plan-only status. Adapters
    execute `re-read -> health -> fence -> move -> verify -> cleanup`, with one verified rollback
    after a post-move verification failure.
11. Add a provider-neutral state profile and eligibility decision. The evaluator accepts explicit
    stateless profiles, validates fresh external-durability or independent restore-rehearsal
    evidence against declared RPO/RTO objectives, and returns typed stable blockers.
12. Expose the decision through plan-only `infrastructure.cluster.state-eligibility`. Bind
    failover/recover and hosted traffic handoff to a fresh exact decision while leaving backup and
    restore execution with the existing Storage Volume operations.

## CQRS, Read Model And Event Impact

- R6a changes value objects/snapshots and query-shaped placement evidence only; it introduces no
  aggregate, table, command or event.
- R6b/R6c may extend connector capabilities and normalized readback in later Tickets, using existing
  plan/accept/apply operations.
- Any durable route handoff state must remain with existing route/domain owners and accepted plan
  receipts, not a new failover aggregate.
- `traffic-status` is query-shaped provider readback. Handoff/failback are synchronous accepted-plan
  connector effects and do not introduce a second CommandBus operation or event stream.

## Test-First Order

1. RED target validation plus missing/shared-domain no-effect placement tests.
2. GREEN deterministic domain-aware placement and safe decision evidence.
3. Contract/schema/adapter fixture parity.
4. Cloud composed policy and persistence adoption.
5. R6b1 public readiness core/contract/application/Web plus Cloud composed no-effect adoption.
6. R6b2 RED `RESIL-CELL-010` and `RESIL-CELLS-011` across core lifecycle, connector exact-plan
   behavior, contracts, Web parameters and deterministic two-cell dry-run/readback.
7. R6b2 Cloud composition and provider-specific redacted plan/readback, followed by the separately
   authorized regional managed-provider packet.
8. R6c RED `RESIL-FENCE-005`, `RESIL-ROUTE-006` and `RESIL-CLEAN-008` at core/contract, fake
   connector, Web parameter/readback and Cloud composed provider-port seams.
9. R6c GREEN happy handoff/status/failback, stale/no-health no-effect, pre-move preservation,
   post-move rollback and zero transient residual evidence.
10. R6d RED core/contract/fake/Web tests for explicit state modes, objective/observed RPO/RTO,
    evidence freshness/independence, local-PVC no-effect and exact decision binding.
11. R6d GREEN stateless, external-durable and restorable decisions plus a deterministic composed
    restore/failover packet; blocked paths prove zero provider/fence/route calls.

## Risks

- False independence: unknown required domains fail closed.
- Split brain: existing epoch/fencing and accepted-plan binding remain mandatory.
- Data loss: workload eligibility is independent from compute placement.
- Provider lock-in: no provider-specific topology DTO crosses the public boundary.
- Cost/orphans: plan and independent zero-residual readback precede production claims.
