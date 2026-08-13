# Kubernetes And Scale Topology Test Matrix

| ID | Level | Evidence target | Binding | Status |
| --- | --- | --- | --- | --- |
| K8S-PROFILE-001 | domain/app/persistence/contract | opaque target profile and secret safety | planned | planned |
| K8S-READY-002 | adapter/integration | non-mutating readiness and stable blockers | planned | planned |
| K8S-ADM-003 | contract/integration | ids-only admission, capability fail-closed/no fallback | planned | planned |
| K8S-OCI-004 | adapter/integration | stateless OCI render/apply/convergence | planned | planned |
| K8S-OBS-005 | contract/integration | normalized logs/health/diagnostics/proof | planned | planned |
| K8S-ISO-006 | security/e2e | tenant/project namespace/RBAC/network/cleanup isolation | planned | planned |
| K8S-ROLLBACK-007 | integration/e2e | failed candidate preservation and verified rollback | planned | planned |
| K8S-CLEAN-008 | integration/e2e | label/receipt-owned cleanup and no collateral deletion | planned | planned |
| SCALE-PROFILE-009 | domain/app/contract | portable replicas/resources/HPA policy and blockers | planned | planned |
| SCALE-CONVERGE-010 | adapter/e2e | desired/current/ready and metric decision convergence | planned | planned |
| ROLLOUT-PROFILE-011 | domain/adapter/e2e | recreate/rolling/canary gates and rollback | planned | planned |
| K8S-COMPOSE-012 | adapter/e2e | service graph/private network/dependency translation | planned | planned |
| K8S-HELM-013 | adapter/e2e | chart plan/diff/apply/upgrade/rollback/cleanup/secret safety | planned | planned |
| K8S-STATEFUL-014 | adapter/e2e | PVC/data/backup/independent restore/cleanup | planned | planned |
| K8S-MULTI-015 | application/e2e | deterministic placement/failover/no silent fallback/orphans | planned | planned |
| K8S-MANAGED-016 | connector/Cloud e2e | managed provisioning composition and custody | planned | planned |
| K8S-SURFACE-017 | contract | CLI/API/SDK/Web/MCP parity and docs | planned | planned |
| K8S-E2E-018 | real cluster | R5a zero-residual packet | planned disposable cluster | planned |
| K8S-E2E-019 | real cluster | R5b/R5c scale/stateful/Helm packet | planned disposable cluster | planned |
| K8S-E2E-020 | real managed/design partner | R5d provision/failover/recover/cleanup packet | explicit authorization required | planned |

R5 total completion requires every row passing; a missing managed/design-partner packet is a real
product evidence gap, not a reason to downgrade `K8S-E2E-020` to a fake test.
