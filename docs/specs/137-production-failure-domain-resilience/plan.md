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

## CQRS, Read Model And Event Impact

- R6a changes value objects/snapshots and query-shaped placement evidence only; it introduces no
  aggregate, table, command or event.
- R6b/R6c may extend connector capabilities and normalized readback in later Tickets, using existing
  plan/accept/apply operations.
- Any durable route handoff state must remain with existing route/domain owners and accepted plan
  receipts, not a new failover aggregate.

## Test-First Order

1. RED target validation plus missing/shared-domain no-effect placement tests.
2. GREEN deterministic domain-aware placement and safe decision evidence.
3. Contract/schema/adapter fixture parity.
4. Cloud composed policy and persistence adoption.
5. R6b1 public readiness core/contract/application/Web plus Cloud composed no-effect adoption.
6. R6b2 managed-cell lifecycle dry-run and disposable multi-host packet, then the explicitly
   authorized regional managed-provider packet.

## Risks

- False independence: unknown required domains fail closed.
- Split brain: existing epoch/fencing and accepted-plan binding remain mandatory.
- Data loss: workload eligibility is independent from compute placement.
- Provider lock-in: no provider-specific topology DTO crosses the public boundary.
- Cost/orphans: plan and independent zero-residual readback precede production claims.
