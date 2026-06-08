# Durable Worker Runtime Test Matrix

This matrix governs the neutral worker runtime topology and queue adapter boundary for durable
long-running Appaloft work. It extends durable process delivery without replacing
`operator-work.*` visibility or workflow-specific worker specs.

| Test ID | Scenario | Layer | Automation |
| --- | --- | --- | --- |
| PROC-DELIVERY-WORKER-001 | Embedded server runtime declares one explicit worker slot by default. | Application | `packages/application/test/durable-work.test.ts` |
| PROC-DELIVERY-WORKER-002 | Standalone runtime can declare multiple worker slots for Cloud or scaled self-hosting. | Application | `packages/application/test/durable-work.test.ts` |
| PROC-DELIVERY-WORKER-003 | Disabled runtime declares no workers for local CLI/PGlite or externally driven progress loops. | Application | `packages/application/test/durable-work.test.ts` |
| PROC-DELIVERY-WORKER-004 | Enabled runtime rejects zero workers before startup. | Application | `packages/application/test/durable-work.test.ts` |
| PROC-DELIVERY-WORKER-005 | Database queue backend uses durable work ledger as durable state authority. | Application | `packages/application/test/durable-work.test.ts` |
| PROC-DELIVERY-WORKER-006 | External queue backend requires an explicit backend kind. | Application | `packages/application/test/durable-work.test.ts` |
| PROC-DELIVERY-WORKER-007 | External queue backend preserves the same public adapter contract for Temporal/Kafka/custom adapters. | Application | `packages/application/test/durable-work.test.ts` |
| PROC-DELIVERY-WORKER-008 | Durable work queue adapter exposes item/event ledger, due candidate, claim, and completion methods independently of process-attempt projection. | Application | `packages/application/test/durable-work.test.ts` |
| PROC-DELIVERY-WORKER-009 | Environment config can select standalone mode, worker count, worker group, and queue backend. | Config | `packages/config/test/index.test.ts` |
| PROC-DELIVERY-WORKER-010 | Environment config can select an external workflow backend such as Temporal. | Config | `packages/config/test/index.test.ts` |
| PROC-DELIVERY-WORKER-011 | Environment config can disable durable workers and preserve zero worker count. | Config | `packages/config/test/index.test.ts` |
| PROC-DELIVERY-WORKER-012 | Doctor maintenance-worker status reports durable worker topology and disabled zero-slot mode. | Shell/Diagnostics | `apps/shell/test/maintenance-worker-status-reader.test.ts` |
| PROC-DELIVERY-WORKER-013 | `appaloft worker` starts worker runtime without starting HTTP server. | CLI | `packages/adapters/cli/test/lifecycle-command.test.ts` |
| PROC-DELIVERY-WORKER-014 | Database backend migrates durable work item and event ledger tables. | Persistence | `packages/persistence/pg/test/durable-work-ledger.pglite.test.ts` |
| PROC-DELIVERY-WORKER-015 | Public application durable work ledger port is independent of process-attempt projection. | Application | `packages/application/test/durable-work.test.ts` |
| PROC-DELIVERY-WORKER-016 | PG durable work ledger records safe item/event state, lists due work, atomically claims one worker, refuses duplicate claims, completes work, and keeps deployment/status monitoring queryable. | Persistence | `packages/persistence/pg/test/durable-work-ledger.pglite.test.ts` |
| PROC-DELIVERY-WORKER-017 | Worker drain lists due work, claims a lease, invokes a registered handler, and completes the item. | Application | `packages/application/test/durable-work.test.ts` |
| PROC-DELIVERY-WORKER-018 | Worker drain skips due work without a registered handler and does not acquire a lease. | Application | `packages/application/test/durable-work.test.ts` |
| PROC-DELIVERY-WORKER-019 | Worker drain completes handler domain errors as retriable failed work instead of leaving a running lease. | Application | `packages/application/test/durable-work.test.ts` |
| PROC-DELIVERY-WORKER-020 | `deployments.create` records pending durable deployment work and an accepted event when a durable queue adapter is configured, without inline runtime execution. | Application | `packages/application/test/create-deployment.test.ts` |
| PROC-DELIVERY-WORKER-021 | Deployment worker drain claims accepted deployment work, executes the runtime backend, persists terminal deployment state, records operator projection state, and completes the durable work item. | Application | `packages/application/test/create-deployment.test.ts` |
| PROC-DELIVERY-WORKER-022 | Server runtime registers the PG durable queue adapter and starts database worker drain loops for declared worker slots. | Server composition | `packages/server` typecheck plus `packages/server/src/index.ts` composition review |
| PROC-DELIVERY-WORKER-023 | Composed PGlite server accepts `deployments.create`, stores pending PG durable work, starts worker runtime, drains the item, and reaches succeeded deployment state. | Server composition | `packages/server/test/durable-work-runtime.test.ts` |
| PROC-DELIVERY-WORKER-024 | Operator-work list reads durable work items by deployment id with sanitized details for post-restart monitoring. | Application | `packages/application/test/operator-work-query.test.ts` |
| PROC-DELIVERY-WORKER-025 | Operator-work show returns ordered safe durable work events from the durable work ledger. | Application | `packages/application/test/operator-work-query.test.ts` |
| PROC-DELIVERY-WORKER-026 | Quick Deploy outcome includes machine-readable deployment/operator-work monitoring commands. | Contracts | `packages/contracts/test/quick-deploy-workflow.test.ts` |
| PROC-DELIVERY-WORKER-027 | Blueprint install responses can expose public-neutral monitoring references for component deployment work. | Cloud composition + public schema | `apps/cloud-runtime/test/cloud-blueprint-marketplace-api.test.ts` plus `packages/application` typecheck |

## Deferred Coverage

- Deployment retry and rollback worker claim/completion.
- Server `/api/system` worker topology readback.
- Full Blueprint install parent-workflow execution through the durable worker, beyond returning
  deployment-work monitoring references for created component deployments.
