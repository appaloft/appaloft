# Production Failure-Domain Resilience — Grill / Discovery

## Status

- Round: Grill complete.
- Date: 2026-08-14.
- Owner decision: the owner explicitly authorized the agent to accept its recommended Grill
  answers for this next product slice. The decisions below are therefore accepted, not inferred
  implementation defaults.
- Predecessor: ADR-114 / Spec 136 R5 managed and multi-cluster topology.

## Actor And Observable Outcome

An operator for a small team can keep an eligible Appaloft-managed workload reachable after one
declared runtime capacity failure domain becomes unavailable, without selecting a replacement
cluster or entering a provider console. The product must show which independent domain was selected,
what was fenced, whether traffic moved, what data-safety class applied, and what cleanup remains.

## Evidence And Facts

- R5 already provides provider-neutral target pools, deterministic placement, bounded failover,
  monotonic placement epochs, fencing tokens and exact cleanup.
- The R5 real packet used two k3d clusters on one Hostinger VPS. It proved control semantics, but
  explicitly reported one physical failure domain and did not prove production high availability.
- DigitalOcean documents DOKS as a managed Kubernetes service. Worker nodes are billed as Droplets;
  the control plane is included, optional control-plane HA is currently USD 40/month, and a load
  balancer currently starts at USD 12/month. These are research facts as of 2026-08-14, not an
  approved purchase: <https://docs.digitalocean.com/products/kubernetes/details/pricing/>.
- Cloudflare Load Balancing can steer between health-checked origin pools, but it is a paid add-on
  and enabling it requires billing confirmation: <https://developers.cloudflare.com/load-balancing/>
  and <https://developers.cloudflare.com/load-balancing/get-started/enable-load-balancing/>.

## Accepted Grill Decisions

| Question | Recommended and accepted decision | Consequence |
| --- | --- | --- |
| Q1. What actor outcome defines the slice? | One eligible managed workload survives loss of one declared runtime failure domain with safe readback and no provider-console step. | Measure continuity and proof, not cluster count. |
| Q2. Is this an R5 repair? | No. R5 is complete within its stated single-host evidence boundary; this is R6 Production Resilience. | Do not rewrite R5 history or reopen its closed gates. |
| Q3. What is an independent target? | A target declares provider-neutral failure-domain identities for provider, region, zone and host where known. Independence is evaluated against explicit required kinds. | Two logical clusters on one host cannot satisfy host or region separation. |
| Q4. What happens when topology identity is missing? | Fail closed before provider effects for any required domain kind. | Unknown is not treated as independent. |
| Q5. Where does the model live? | Failure-domain candidates, intent, decision evidence and fencing are public neutral contracts. | Cloud must reuse public placement rather than add a private topology engine. |
| Q6. What remains private? | Tenant policy, provider binding, credentials, capacity inventory, cost, support, entitlement, billing, operational SLO and provider adapter. | Hosted policy stays injectable and auditable. |
| Q7. What is the first provider path? | DigitalOcean DOKS is the first production candidate because DigitalOcean is the current runtime provider and DOKS reuses the R5 Kubernetes backend. The public contract remains provider-neutral. | Do not add provider keys to public domain rules. |
| Q8. What topology closes the first production packet? | Two independently identified regional capacity cells. Each cell is a separate cluster; same-region or same-host pairs do not close the packet. | Cross-provider remains a later hardening/adoption packet unless separately approved. |
| Q9. Is failover automatic? | Detection may be automatic, but traffic-changing failover requires policy admission, fencing, readiness proof and an auditable handoff receipt. Failback is explicit by default. | Prevent split brain and recovery flapping. |
| Q10. Which workloads are initially eligible? | Stateless workloads and workloads whose durable state is external or has an independently verified restore/failover contract. Region-local PVC alone is ineligible. | Do not imply data HA from compute HA. |
| Q11. Does this prove control-plane HA? | No. Data-plane continuity and Appaloft control-plane resilience are separate claims. The latter remains an operations/DR program requirement. | A surviving workload does not prove the control plane can orchestrate during its own outage. |
| Q12. What external effects are allowed before another approval? | Research, docs, tests, provider-neutral code, fake/dry-run plans and read-only provider inspection. No paid cluster, load balancer, DNS change or production cutover. | Stop at an exact cost/cleanup approval gate. |

## Rejected Alternatives

- Counting clusters or regions without comparing declared failure-domain identities.
- Treating different namespaces, k3d clusters or node names on one host as independent capacity.
- Building DigitalOcean-specific placement rules into public core.
- Automatically failing over workloads with unproven state replication or restore semantics.
- Equating healthy secondary compute with completed DNS/traffic handoff.
- Claiming platform/control-plane HA from a workload-only packet.

## R6b1 Accepted Grill Decisions

The owner authorized the agent to accept the recommended Grill for the next slice. The following
decisions are accepted for R6b1 and do not weaken the broader R6b managed-cell lifecycle gate.

| Question | Recommended and accepted decision | Consequence |
| --- | --- | --- |
| Q13. What closes the first R6b vertical slice? | An operator can ask whether one exact current placement has at least one independently identified, ready replacement with capacity. | R6b1 closes replacement-capacity readiness only; it does not close managed-cell lifecycle or the real packet. |
| Q14. Which surface owns the query? | Reuse `connections.capability.plan` with the neutral capability `infrastructure.cluster.readiness`. | No second placement operation, aggregate, table or hidden write path is added. |
| Q15. Is blocked readiness an error? | Valid input returns a typed `ready` or `blocked` result. Missing current target, no independent candidate, zero capacity, non-ready status, excluded target or missing capability appear as stable safe reasons. | Operators can diagnose capacity without converting an expected unavailable state into a transport failure. |
| Q16. What evidence is safe and sufficient? | Return the exact pool/workload/current target and epoch, required domains/capabilities, deterministic considered and eligible target ids, selected target topology, total eligible replacement capacity, estimated cost and support level. | Provider binding, credentials and private support references never cross the public contract. |
| Q17. Does readiness reserve capacity or fence placement? | No. It evaluates one immutable target-pool snapshot and emits neither a next placement epoch nor a fencing token. | R6c must bind a later mutation to fresh readiness, fencing and an exact accepted plan. |
| Q18. Which effects are allowed? | The query performs no cluster, workload, route, DNS or provider mutation and has no apply path. | `canApply` is false; provider-spy tests prove no mutation. |
| Q19. Does this complete R6b? | No. Cell import/provision, inspect, drain/delete and external provider evidence remain R6b2. | `R6-CLOUD-CELLS-005` stays open until the lifecycle and provider packet pass. |
| Q20. Is another ADR required? | ADR-115 already owns the later readiness query and public/private boundary; update it with the explicit typed/no-effect semantics rather than add a competing ADR. | Canonical language remains `independent replacement readiness`. |

## Open Operational Questions

These do not block the provider-neutral first Code slice, but they block the paid production packet:

1. exact DOKS regions, worker sizes/counts and control-plane HA selection;
2. Cloudflare Load Balancing plan and measured monthly/temporary test cost;
3. production versus disposable acceptance environment and maximum allowed spend;
4. traffic health threshold, failover/failback change window and rollback owner;
5. RPO/RTO and eligible state backend for the stateful packet;
6. cleanup policy for disposable resources or retention policy for accepted production cells.
