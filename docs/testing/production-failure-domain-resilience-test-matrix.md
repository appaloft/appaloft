# Production Failure-Domain Resilience Test Matrix

| ID | Level | Evidence target | Binding | Status |
| --- | --- | --- | --- | --- |
| RESIL-FD-001 | core/contract | bounded failure-domain identity validation | managed topology core and schema tests | verified |
| RESIL-PLACE-002 | core/application | required missing/shared domain fails before provider effect | target-pool and connector no-effect tests | verified |
| RESIL-DECIDE-003 | core/contract | deterministic selected-domain evidence, epoch and fencing | repeated placement snapshots | verified |
| RESIL-READY-004 | core/contract/query/Web/Cloud integration | typed ready/blocked independent replacement capacity, deterministic safe evidence and no mutation/apply path | public #1110 / `def417be`; Cloud #908 / `db83448a`; target-pool, connector, contract, Web and composed credential/provider-spy tests | verified |
| RESIL-CELL-010 | core/application/contract/Web | provision/import, safe inspect, drain-before-delete, imported-resource retention and exact accepted-plan binding | public #1113; core lifecycle, connector, contract and Web transport tests | verified |
| RESIL-CELLS-011 | application/Cloud integration | two independently identified cells complete deterministic dry-run/readback, readiness, survivor preservation and zero Appaloft-owned residual | public #1113 fake two-cell packet; Cloud provider-plan/readback remains separately tracked | public verified |
| RESIL-FENCE-005 | core/application/integration | live route/current endpoint/epoch drift, stale token or expired/unhealthy replacement fails before fence/route effects; valid handoff fences before move | public #1117 core/fake exact-plan and provider-spy ordering tests; Cloud injected-port no-effect/order packet | verified internal |
| RESIL-ROUTE-006 | contract/connector/Web/Cloud integration | exact route/endpoints/health/epoch/token handoff, plan-only status readback and explicit fresh-plan failback | public #1117 shared schemas, fake connector and Web readback; Cloud composed handoff/status/replay/failback packet | verified internal |
| RESIL-STATE-007 | core/contract/application/Web/Cloud integration | explicit stateless/external/restorable/local-PVC decision; fresh independent evidence; observed RPO/RTO within objectives; missing/expired/shared-target/over-SLO/local-PVC no-effect blockers; exact failover/recover/handoff binding | state evaluator, connector schema/fake/Web tests and Cloud injected state-reader/provider-spy restore/failover packet | planned |
| RESIL-CLEAN-008 | integration/e2e | pre-move failure preserves old authority; post-move proof failure rolls back or reports manual intervention; receipt-owned transient cleanup is exact | public fake and Cloud provider-port failure injection prove preserved/rolled-back/manual-intervention with zero internal residual; real packet remains pending | verified internal; real packet pending |
| RESIL-E2E-009 | real provider | independent regional failure/failover/recovery/cost/cleanup | separately authorized managed-provider packet | blocked on external approval |

Automated or same-host evidence may close internal rows but cannot close `RESIL-E2E-009`.
