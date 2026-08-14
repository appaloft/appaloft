# ADR-115: Managed Capacity Failure-Domain Boundary

Status: Accepted

Date: 2026-08-14

## Context

ADR-114 and Spec 136 provide deterministic managed target placement, failover attempts, placement
epochs and fencing. Their real R5 packet intentionally used two logical clusters on one physical
host. Production resilience requires the placement model to distinguish logical target identity
from infrastructure blast radius without exposing hosted provider policy or creating a second Cloud
placement engine.

## Decision

1. A managed target may declare a bounded set of provider-neutral failure-domain identities. The
   initial kinds are `provider`, `region`, `zone` and `host`; each identity has a non-secret key.
2. Placement intent declares the failure-domain kinds that must differ from the current target.
   Missing identity for a required kind is ineligible, not implicitly independent.
3. Failover and recovery compare candidates with the current target inside the public
   `ManagedClusterTargetPool`. Decisions return safe selected-domain evidence and stable reason
   codes for missing or shared domains.
4. Initial placement with required domain kinds accepts only targets that declare those kinds.
   Independent replacement readiness reuses the same target-pool eligibility and ranking rules,
   requires one exact current target, and returns typed `ready` or `blocked` evidence through the
   existing connector plan query. It does not reserve capacity, increment an epoch, emit a fencing
   token, expose private bindings, or perform cluster, workload, provider, route or DNS mutation.
5. Placement epochs and fencing tokens remain authoritative. Failure-domain separation does not
   itself move traffic, replicate data, or prove recovery; those require explicit provider-neutral
   handoff/readiness receipts.
6. Workload eligibility is separate from topology. Stateless or externally durable workloads may
   enter automatic policy; region-local state without a verified recovery contract must fail closed.
7. Cloud/Enterprise owns provider bindings, tenant policy, credentials, capacity, cost, support,
   traffic-provider composition and operational SLO. Public Appaloft owns only neutral intent,
   decision evidence and lifecycle contracts.
8. A public `Managed Capacity Cell` is the neutral lifecycle view of one managed-cluster target.
   It records explicit `provisioned|imported` origin and `accepting|draining|drained|deleted|failed`
   lifecycle status. Provision/import/drain/delete reuse exact connector plan acceptance; inspect is
   read-only. Drain prevents new placement, and delete requires a drained cell with zero active
   placements.
9. Imported cells retain their external provider resource when Appaloft management is deleted.
   Provider-owned provisioned cells may delete provider resources only when the accepted plan and
   receipt explicitly select that disposition. Provider-specific documents remain adapter-local.
10. Managed traffic handoff reuses the connector exact plan/accept/apply boundary. The public
    contract owns safe route/endpoint identity, bounded health proof, placement epoch/fencing,
    outcome, rollback and receipt-owned cleanup evidence. Provider route objects and credentials
    remain adapter-local; existing route/domain owners remain authoritative and no failover
    aggregate or route table is added.
11. Apply re-reads live route authority and replacement health, rejects drift before effect, fences
    the previous placement before moving authority, verifies the new endpoint, and performs one
    exact verified rollback after a post-move verification failure. Failback is a fresh accepted
    plan with a later epoch/token. Unproven rollback is `manual-intervention`, never success.

## Consequences

- A same-host pair can still be used for lifecycle tests but cannot satisfy a host-separated policy.
- Provider/region/zone/host keys become safe public topology evidence, never credential or provider
  API documents.
- Existing target snapshots require an additive field during the pre-1.0 Code Round; all fixtures,
  schemas and entrypoints must be synchronized directly rather than adding compatibility fallbacks.
- Capacity-cell lifecycle readback makes active placement count and provider-resource disposition
  explicit so drain/delete safety is observable without leaking provider bindings.
- A production claim still requires real independent-domain, traffic, state-safety and cleanup
  evidence. Unit tests cannot close the external packet.

## Rejected Alternatives

Comparing only `targetId`, inferring independence from region labels, Cloud-only filtering, raw
provider topology objects, automatic stateful failover and automatic failback without fencing.

## Verification

See Spec 137 and `docs/testing/production-failure-domain-resilience-test-matrix.md`.
