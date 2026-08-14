# Production Failure-Domain Resilience Test Matrix

| ID | Level | Evidence target | Binding | Status |
| --- | --- | --- | --- | --- |
| RESIL-FD-001 | core/contract | bounded failure-domain identity validation | managed topology core and schema tests | verified |
| RESIL-PLACE-002 | core/application | required missing/shared domain fails before provider effect | target-pool and connector no-effect tests | verified |
| RESIL-DECIDE-003 | core/contract | deterministic selected-domain evidence, epoch and fencing | repeated placement snapshots | verified |
| RESIL-READY-004 | core/contract/query/Web/Cloud integration | typed ready/blocked independent replacement capacity, deterministic safe evidence and no mutation/apply path | public #1110 / `def417be`; Cloud #908 / `db83448a`; target-pool, connector, contract, Web and composed credential/provider-spy tests | verified |
| RESIL-CELL-010 | core/application/contract/Web | provision/import, safe inspect, drain-before-delete, imported-resource retention and exact accepted-plan binding | managed capacity-cell lifecycle and transport parity tests | planned |
| RESIL-CELLS-011 | application/Cloud integration | two independently identified cells complete deterministic dry-run/readback, readiness, survivor preservation and zero Appaloft-owned residual | public fake packet plus Cloud provider-plan/readback packet | planned |
| RESIL-FENCE-005 | application/integration | stale epoch/token cannot move writer or route authority | accepted-plan/fencing tests | planned |
| RESIL-ROUTE-006 | connector/e2e | replacement health then exact traffic handoff/rollback | route connector plus real endpoints | planned |
| RESIL-STATE-007 | policy/e2e | local state blocked or verified durable-state evidence | workload eligibility and restore/failover packet | planned |
| RESIL-CLEAN-008 | integration/e2e | receipt-owned rollback/cleanup, healthy owner preserved | failure injection and residual readback | planned |
| RESIL-E2E-009 | real provider | independent regional failure/failover/recovery/cost/cleanup | separately authorized managed-provider packet | blocked on external approval |

Automated or same-host evidence may close internal rows but cannot close `RESIL-E2E-009`.
