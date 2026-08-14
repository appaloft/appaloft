# Production Failure-Domain Resilience Test Matrix

| ID | Level | Evidence target | Binding | Status |
| --- | --- | --- | --- | --- |
| RESIL-FD-001 | core/contract | bounded failure-domain identity validation | managed topology core and schema tests | planned |
| RESIL-PLACE-002 | core/application | required missing/shared domain fails before provider effect | target-pool and connector no-effect tests | planned |
| RESIL-DECIDE-003 | core/contract | deterministic selected-domain evidence, epoch and fencing | repeated placement snapshots | planned |
| RESIL-READY-004 | query/integration | independent replacement readiness without mutation | readiness query and provider-spy negatives | planned |
| RESIL-FENCE-005 | application/integration | stale epoch/token cannot move writer or route authority | accepted-plan/fencing tests | planned |
| RESIL-ROUTE-006 | connector/e2e | replacement health then exact traffic handoff/rollback | route connector plus real endpoints | planned |
| RESIL-STATE-007 | policy/e2e | local state blocked or verified durable-state evidence | workload eligibility and restore/failover packet | planned |
| RESIL-CLEAN-008 | integration/e2e | receipt-owned rollback/cleanup, healthy owner preserved | failure injection and residual readback | planned |
| RESIL-E2E-009 | real provider | independent regional failure/failover/recovery/cost/cleanup | separately authorized managed-provider packet | blocked on external approval |

Automated or same-host evidence may close internal rows but cannot close `RESIL-E2E-009`.
