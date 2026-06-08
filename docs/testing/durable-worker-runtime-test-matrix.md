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
| PROC-DELIVERY-WORKER-005 | Database queue backend uses process-attempt journal as durable state authority. | Application | `packages/application/test/durable-work.test.ts` |
| PROC-DELIVERY-WORKER-006 | External queue backend requires an explicit backend kind. | Application | `packages/application/test/durable-work.test.ts` |
| PROC-DELIVERY-WORKER-007 | External queue backend preserves the same public adapter contract for Temporal/Kafka/custom adapters. | Application | `packages/application/test/durable-work.test.ts` |
| PROC-DELIVERY-WORKER-008 | Durable work queue adapter composes process-attempt record/read/candidate/retry/claim/completion ports. | Application | `packages/application/test/durable-work.test.ts` |
| PROC-DELIVERY-WORKER-009 | Environment config can select standalone mode, worker count, worker group, and queue backend. | Config | `packages/config/test/index.test.ts` |
| PROC-DELIVERY-WORKER-010 | Environment config can select an external workflow backend such as Temporal. | Config | `packages/config/test/index.test.ts` |
| PROC-DELIVERY-WORKER-011 | Environment config can disable durable workers and preserve zero worker count. | Config | `packages/config/test/index.test.ts` |

## Deferred Coverage

- Deployment create worker claim/completion.
- Deployment retry and rollback worker claim/completion.
- Server `/api/system` worker topology readback.
- Dedicated `appaloft worker` startup command.
- Cloud Blueprint install acceptance composing public deployment worker attempts.
