# Production Failure-Domain Resilience

## Status

- Round: Spec.
- Artifact state: owner-authorized self-accepted recommendation on 2026-08-14.
- Code changes allowed only after actor-visible Tickets are `ready-for-agent`.
- Governing decisions: ADR-023, ADR-114 and ADR-115.

## Business Outcome

An eligible workload can move from one unavailable managed capacity domain to a proven independent
domain with deterministic placement, fencing, readiness, traffic handoff and safe cleanup evidence.

## Release Subprofiles

| Profile | Actor-visible outcome | Exit evidence |
| --- | --- | --- |
| R6a Failure-Domain Admission | operator can see why a target is or is not independent | typed identity, no-effect missing/shared-domain blockers, deterministic decision evidence |
| R6b Managed Capacity Cells | hosted capacity exists in two independently identified regional cells | R6b1 independent replacement readiness; R6b2 provision/import, inspect, drain/delete, cost/support and lifecycle receipts |
| R6c Traffic Handoff | healthy traffic moves only after replacement readiness and fencing | route plan/accept/apply, endpoint identity, rollback/failback and split-brain negatives |
| R6d Stateful Eligibility And DR | stateful workloads fail closed or use verified external/restore semantics | eligibility reason, RPO/RTO evidence, independent restore/failover and cleanup |

R6 is complete only after all four profiles pass a real independent-domain packet. R6 does not by
itself claim Appaloft control-plane high availability or cross-provider outage tolerance.

## Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| RESIL-FD-001 | bounded topology identity | a managed target is configured | its candidate snapshot is validated | provider/region/zone/host identities are unique, non-empty and secret-free; unsupported kinds fail. |
| RESIL-PLACE-002 | independent failover admission | current and candidate targets share or omit a required domain | failover/recovery placement runs | candidate is ineligible before provider effects with stable missing/shared reason codes. |
| RESIL-DECIDE-003 | deterministic safe evidence | more than one independent candidate is eligible | placement runs repeatedly | target, domain evidence, ranked candidates, epoch, fencing token and reasons are deterministic. |
| RESIL-READY-004 | independent replacement readiness | a pool, current placement and workload policy exist | `infrastructure.cluster.readiness` is planned | valid input returns typed `ready` or `blocked` evidence over the exact snapshot; it exposes deterministic candidate/capacity/cost/support reasons without cluster, workload, provider, route or DNS mutation, capacity reservation, a next epoch or a fencing token. |
| RESIL-CELL-010 | managed capacity-cell lifecycle | an operator has an entitled target pool and an exact provider-neutral cell plan | the cell is provisioned or imported, inspected, drained and deleted | the accepted-plan-bound lifecycle returns safe origin/status/topology/capacity/cost/support/disposition receipts; drain blocks new placement, delete requires zero active placements, and imported provider resources are retained. |
| RESIL-CELLS-011 | exact two-cell dry-run | two explicit cells declare different required failure-domain keys | the lifecycle and readiness packet runs | both cells have deterministic plan/readback, one is independently replacement-ready, drain/delete preserves the surviving cell, and zero Appaloft-owned residual evidence is returned without paid provider mutation. |
| RESIL-FENCE-005 | one writer/route owner | replacement is ready and the live route still names the planned current endpoint/epoch | traffic handoff is applied | fresh health is re-read, the previous placement is fenced before route authority moves, and stale route identity/epochs/tokens fail before provider effects. |
| RESIL-ROUTE-006 | explicit traffic handoff | two endpoints have bounded health evidence | handoff or failback runs | the accepted plan binds exact route/workload/endpoints/epochs/token/proof, verifies replacement, moves and re-verifies route authority, and a plan-only status query returns the observed authority. Failback requires a new accepted plan. |
| RESIL-STATE-007 | state safety | workload uses local or external durable state | failover is planned | unsupported local state fails closed; supported state declares evidence refs and bounded RPO/RTO. |
| RESIL-CLEAN-008 | exact rollback and cleanup | failover succeeds or aborts | cleanup runs | pre-move failure preserves the old healthy route; post-move verification failure performs one exact rollback and verifies actual authority; only receipt-owned transient route artifacts are removed. Unproven rollback is reported as manual intervention, never success. |
| RESIL-E2E-009 | real independent-domain packet | two authorized regional managed cells exist | failure/failover/recovery/cleanup runs | workload identity, traffic continuity, fencing, cost/support and independent residual readback pass. |

## Public Surface

- Extend the existing managed target-pool, placement-intent and placement-decision contracts; do not
  add a second placement command or Cloud-only topology model.
- Reuse `connections.capability.plan|accept|apply` for provider lifecycle and future traffic handoff
  capabilities. Mutation remains bound to the exact accepted plan.
- Extend that protocol with `infrastructure.cluster.import` and `infrastructure.cluster.drain`.
  `provision|import|drain|delete` require plan acceptance; `inspect` is read-only. A managed capacity
  cell exposes only provider-neutral origin, lifecycle, topology, capacity, cost/support and
  provider-resource disposition evidence.
- Reuse `connections.capability.plan` for `infrastructure.cluster.readiness`; this capability is
  plan-only, returns safe typed replacement-capacity evidence and has no apply path.
- Add exact-plan mutations `infrastructure.cluster.handoff-traffic` and
  `infrastructure.cluster.failback-traffic`, plus plan-only
  `infrastructure.cluster.traffic-status`. Their provider-neutral contracts expose safe endpoint,
  health, fencing, route-authority, rollback and cleanup evidence without raw provider objects.
- A traffic apply must re-read live route authority and replacement health. It may move authority
  only after fencing the previous placement. Apply returns `moved`, `preserved`, `rolled-back` or
  `manual-intervention` evidence; failback always uses a fresh plan, epoch and fencing token.
- Keep `deployments.create` ids-only and reuse existing logs, health, proof, route and recovery
  contracts.
- Surface safe topology/readiness evidence through shared contracts consumed by CLI/API/SDK/Web/MCP.
- A cell may be `provisioned` or `imported`, and may move through `accepting -> draining -> drained ->
  deleted` (or `failed`). Imported-cell deletion removes Appaloft management only and must report
  that the external provider resource is retained.

## Non-Goals

- Raw Kubernetes/provider administration, synchronous storage replication, universal zero-downtime
  claims, silent failback, cross-provider requirement in the first production packet, or hosted
  pricing/credentials in public packages.
- Claiming Appaloft control-plane HA from data-plane workload survival.

## Compatibility And Migration

This is an additive pre-1.0 behavior change, but target candidates without required topology
identity become correctly ineligible. Code Round must update schemas and fixtures atomically and
must not add fallback inference from target ids, provider names or region strings.
