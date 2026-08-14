# Kubernetes And Scale Topology Test Matrix

| ID | Level | Evidence target | Binding | Status |
| --- | --- | --- | --- | --- |
| K8S-PROFILE-001 | domain/app/persistence/contract | opaque target profile and secret safety | core/application/contracts/PGlite profile tests | passed |
| K8S-READY-002 | adapter/integration | non-mutating readiness and stable blockers | Kubernetes backend readiness tests plus real packet | passed |
| K8S-ADM-003 | contract/integration | ids-only admission, capability fail-closed/no fallback | runtime intent and exact backend registry tests | passed |
| K8S-OCI-004 | adapter/integration | stateless OCI render/apply/convergence | runtime intent/backend tests plus real packet | passed |
| K8S-OBS-005 | contract/integration | normalized logs/health/diagnostics/proof | runtime logs/health/proof tests plus real packet | passed |
| K8S-ISO-006 | security/e2e | tenant/project namespace/RBAC/network/cleanup isolation | exact routing policy/NetworkPolicy tests plus real packet | passed |
| K8S-ROLLBACK-007 | integration/e2e | failed candidate preservation and verified rollback | backend failure test plus real failed-candidate packet | passed |
| K8S-CLEAN-008 | integration/e2e | label/receipt-owned cleanup and no collateral deletion | receipt mismatch tests plus independent zero-residual readback | passed |
| SCALE-PROFILE-009 | domain/app/contract | portable replicas/resources/HPA policy and blockers | core/application/persistence/contracts and API/CLI/Web tests | passed |
| SCALE-CONVERGE-010 | adapter/e2e | desired/current/ready and metric decision convergence | Kubernetes adapter tests plus real metrics-server/HPA packet | passed |
| ROLLOUT-PROFILE-011 | domain/adapter/e2e | recreate/rolling/canary gates and rollback | staged route/readback/proof tests plus real weighted-traffic packet | passed |
| K8S-COMPOSE-012 | adapter/e2e | service graph/private network/dependency translation | Kubernetes intent service-graph translation tests | passed |
| K8S-HELM-013 | adapter/e2e | chart plan/diff/apply/upgrade/rollback/cleanup/secret safety | typed source/persistence/contracts, credential-aware server composition, lifecycle/backend tests and real Helm packet | passed |
| K8S-STATEFUL-014 | adapter/e2e | PVC/data/backup/independent restore/cleanup | stable storage-scope intent, backup/restore tests and real PVC packet | passed |
| K8S-MULTI-015 | application/e2e | deterministic placement/failover/no silent fallback/orphans | core target-pool and application connector tests pass; Cloud composition and real packet remain | in progress |
| K8S-MANAGED-016 | connector/Cloud e2e | managed provisioning composition and custody | typed plan/provision/inspect/delete/failover, exact accepted-plan binding and safe receipt tests pass; Cloud custody/provider packet remains | in progress |
| K8S-SURFACE-017 | contract | CLI/API/SDK/Web/MCP parity and docs | existing-cluster surfaces pass; managed connector contracts, oRPC, shared CLI/SDK/MCP operations and docs pass; Cloud managed-cluster Web surface remains | in progress |
| K8S-E2E-018 | real cluster | R5a zero-residual packet | 2026-08-13 disposable k3d success/failure/cleanup packet | passed |
| K8S-E2E-019 | real cluster | R5b/R5c scale/stateful/Helm packet | 2026-08-13 R5b scale/canary and R5c stateful/Helm packets passed | passed |
| K8S-E2E-020 | real managed/design partner | R5d provision/failover/recover/cleanup packet | explicit authorization required | planned |

R5 total completion requires every row passing; a missing managed/design-partner packet is a real
product evidence gap, not a reason to downgrade `K8S-E2E-020` to a fake test.

## R5d Public Automated Evidence

On 2026-08-14 the public automated packet passed deterministic target-pool ranking, bounded
failover, monotonic placement epochs, fencing tokens, explicit no-capacity conflicts, typed managed
cluster provision/inspect/delete/failover plans and receipts, exact accepted-plan binding, and safe
cost/support/cleanup readback. Contract and HTTP/oRPC tests proved the typed evidence survives the
shared `connections.capability.plan|accept|apply` surface while undeclared credential material is
removed. CLI, generated SDK and MCP continue to use those same operation-catalog entries. Cloud
custody, entitlement, tenant isolation, provider composition, managed-cluster Web composition and
`K8S-E2E-020` remain open evidence.

## R5a Real Packet Evidence

On 2026-08-13 the opt-in `kubernetes-existing-cluster.smoke.test.ts` packet ran against a disposable
k3d cluster with k3s Traefik. It proved readiness, stateless OCI apply/rollout, an exact ingress
controller NetworkPolicy source, routed deployment identity, normalized health/proof/logs, a second
failed candidate with exact receipt cleanup, preservation of the first healthy route, final cleanup,
and an independent zero-owned-namespace readback. The packet passed 21 assertions. The cluster,
network, attached image volume, and isolated kubeconfig were deleted after verification.

## R5b Real Packet Evidence

On 2026-08-13 `kubernetes-scale-rollout.smoke.test.ts` ran against a disposable two-node k3d
cluster with k3s Traefik and the official metrics-server v0.8.1 manifest. It proved two ready
candidate replicas, CPU/memory requests and limits, a real HPA and metrics API, stable endpoint
preservation, distinct length-safe Kubernetes route identities, 10/40/70/100 Traefik weights,
external route-identity convergence at every step, mixed stable/candidate traffic before promotion,
candidate-only traffic at 100%, exact cleanup of both receipt-owned namespaces, and zero residual
Appaloft namespaces. The packet passed 17 assertions. The cluster, network, attached image volume,
and isolated kubeconfig were deleted after verification.

## R5c Real Packet Evidence

On 2026-08-13 `kubernetes-stateful-helm.smoke.test.ts` ran against a disposable k3d cluster. It
proved stable StatefulSet/PVC identity across two Deployment receipts, durable data readback,
cleanup of the old receipt without deleting the current workload or PVC, a tar backup through a
read-only PVC helper, independent restore to a new canonical PVC, and restored data readback. The
same packet installed and upgraded a typed local Helm chart, forced a bounded failed upgrade,
verified atomic rollback by redacted manifest digest and live v2 data, then used foreground
uninstall and independently confirmed zero Appaloft-owned residual resources. The packet passed 56
assertions. Its namespaces, PVCs, cluster, network, volume and isolated kubeconfig were deleted.
The server composition also forwards an injected `KubernetesHelmValuesResolver` through an
options-based backend factory while retaining file references as the Community default. Regression
coverage proves opaque values references reach the injected resolver and only materialized file
paths reach Helm argv.
