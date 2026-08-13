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
| SCALE-PROFILE-009 | domain/app/contract | portable replicas/resources/HPA policy and blockers | planned | planned |
| SCALE-CONVERGE-010 | adapter/e2e | desired/current/ready and metric decision convergence | planned | planned |
| ROLLOUT-PROFILE-011 | domain/adapter/e2e | recreate/rolling/canary gates and rollback | planned | planned |
| K8S-COMPOSE-012 | adapter/e2e | service graph/private network/dependency translation | planned | planned |
| K8S-HELM-013 | adapter/e2e | chart plan/diff/apply/upgrade/rollback/cleanup/secret safety | planned | planned |
| K8S-STATEFUL-014 | adapter/e2e | PVC/data/backup/independent restore/cleanup | planned | planned |
| K8S-MULTI-015 | application/e2e | deterministic placement/failover/no silent fallback/orphans | planned | planned |
| K8S-MANAGED-016 | connector/Cloud e2e | managed provisioning composition and custody | planned | planned |
| K8S-SURFACE-017 | contract | CLI/API/SDK/Web/MCP parity and docs | operation catalog, CLI, oRPC, SDK, Web, MCP and docs registry tests | passed |
| K8S-E2E-018 | real cluster | R5a zero-residual packet | 2026-08-13 disposable k3d success/failure/cleanup packet | passed |
| K8S-E2E-019 | real cluster | R5b/R5c scale/stateful/Helm packet | planned disposable cluster | planned |
| K8S-E2E-020 | real managed/design partner | R5d provision/failover/recover/cleanup packet | explicit authorization required | planned |

R5 total completion requires every row passing; a missing managed/design-partner packet is a real
product evidence gap, not a reason to downgrade `K8S-E2E-020` to a fake test.

## R5a Real Packet Evidence

On 2026-08-13 the opt-in `kubernetes-existing-cluster.smoke.test.ts` packet ran against a disposable
k3d cluster with k3s Traefik. It proved readiness, stateless OCI apply/rollout, an exact ingress
controller NetworkPolicy source, routed deployment identity, normalized health/proof/logs, a second
failed candidate with exact receipt cleanup, preservation of the first healthy route, final cleanup,
and an independent zero-owned-namespace readback. The packet passed 21 assertions. The cluster,
network, attached image volume, and isolated kubeconfig were deleted after verification.
