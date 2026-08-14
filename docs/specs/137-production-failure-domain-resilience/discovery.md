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

## R6b2 Accepted Grill Decisions

The owner asked the agent to complete R6b2 and retained the authorization for the agent to accept
its recommended Grill answers. These decisions define the managed capacity-cell lifecycle slice;
they do not authorize paid provider mutation or pull R6c traffic handoff into this round.

| Question | Recommended and accepted decision | Consequence |
| --- | --- | --- |
| Q21. What is the canonical resource? | A **Managed Capacity Cell** is one independently identifiable managed-cluster target that contributes schedulable capacity to one target pool. Existing `infrastructure.cluster.*` capability keys remain the transport vocabulary. | Add no Cloud-only cluster model and do not rename existing compatibility surfaces. |
| Q22. How can a cell enter management? | `provision` creates a provider-owned cell; `import` adopts an existing cluster reference without claiming ownership of the provider resource. Both require explicit topology, capacity, support and cleanup semantics. | Import is not a disguised provider create and cannot infer failure domains from a name or region label. |
| Q23. What does inspect return? | `inspect` is read-only and returns a safe exact cell snapshot: origin, lifecycle status, target/pool identity, declared failure domains, available capacity, active placement count, cost/support and provider-resource disposition. | Provider binding, credentials, raw provider objects and private support references remain outside the public contract. |
| Q24. What does drain mean? | An accepted `drain` plan first stops new placement. It returns `draining` while active placements remain and `drained` only when the active placement count is zero. | Drain is a lifecycle transition, not a best-effort label; placement must treat non-accepting cells as unavailable. |
| Q25. When may delete run? | `delete` requires an exact accepted plan over a drained cell with zero active placements. Provisioned cells may delete owned provider resources; imported cells only leave Appaloft management and retain the external resource. | Delete-before-drain and imported-resource destruction fail before provider effects. |
| Q26. How is exact-plan safety preserved? | Import, provision, drain and delete all reuse `connections.capability.plan -> accept -> apply`; apply parameters must reproduce the accepted plan. Inspect remains plan-only. | No hidden provider endpoint or direct repository mutation is introduced. |
| Q27. What closes the internal R6b2 gate? | Two explicit cells with different required domain keys complete provision/import, inspect, drain/delete and independent readiness in a deterministic dry-run/readback packet, including cost/support and zero Appaloft-owned residual evidence. | Fake or dry-run evidence can close internal contract/composition rows but not the real regional provider packet. |
| Q28. What DigitalOcean work is allowed now? | Cloud may implement a DOKS-specific redacted planning/readback adapter and use read-only provider options/inventory. It must not create, resize or delete DOKS resources without a separately approved target, cost ceiling and cleanup packet. | R6b2 code can be complete while `RESIL-E2E-009` remains blocked on external approval. |

## Open Operational Questions

These do not block the provider-neutral first Code slice, but they block the paid production packet:

1. exact DOKS regions, worker sizes/counts and control-plane HA selection;
2. Cloudflare Load Balancing plan and measured monthly/temporary test cost;
3. production versus disposable acceptance environment and maximum allowed spend;
4. traffic health threshold, failover/failback change window and rollback owner;
5. RPO/RTO and eligible state backend for the stateful packet;
6. cleanup policy for disposable resources or retention policy for accepted production cells.
