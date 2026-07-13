# Deployment Stale Attempt Reconciliation Test Matrix

| ID | Layer | Behavior | Automation binding |
| --- | --- | --- | --- |
| `DEP-STALE-001` | application query | Bounded query returns only non-terminal attempts older than threshold with state version. | `packages/application/test/deployment-stale-attempt.test.ts` |
| `DEP-STALE-002` | core/application | Planned stale attempt becomes interrupted without backend cancel. | `packages/core/test/deployment.test.ts`; application test |
| `DEP-STALE-003` | application | Running stale attempt cancels runtime and becomes interrupted. | application test |
| `DEP-STALE-004` | application | Changed durable activity/state version rejects reconciliation. | application test |
| `DEP-STALE-005` | application | Recently active attempt rejects reconciliation. | application test |
| `DEP-STALE-006` | core/application | Terminal attempts are omitted/rejected. | core/application tests |
| `DEP-STALE-007` | recovery | Interrupted attempt is retryable when retained inputs are ready. | recovery readiness/retry tests |
| `DEP-STALE-008` | persistence/HTTP | Tenant context and persistence round trip fail closed. | PGlite and oRPC tests |
