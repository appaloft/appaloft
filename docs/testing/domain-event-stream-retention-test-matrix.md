# Domain Event Stream Retention Test Matrix

This matrix governs dry-run-first retention for retained domain event stream rows. It does not
govern audit rows, legal holds, immutable archives, outbox/inbox/process attempts, logs, snapshots,
runtime artifacts, organization defaults, or scheduled retention automation.

| Test ID | Scenario | Layer | Automation |
| --- | --- | --- | --- |
| DOMAIN-EVENT-RETENTION-001 | `domain-events.prune` defaults to dry-run and deletes no event stream rows from `domain_event_stream_records`. | Application + persistence/pg | Covered by `packages/application/test/domain-event-retention.test.ts` and `packages/persistence/pg/test/domain-event-stream-retention.pglite.test.ts`. |
| DOMAIN-EVENT-RETENTION-002 | Destructive prune deletes only old eligible `domain_event_stream_records` rows and returns counts by event type. | Application + persistence/pg | Covered by `packages/application/test/domain-event-retention.test.ts` and `packages/persistence/pg/test/domain-event-stream-retention.pglite.test.ts`. |
| DOMAIN-EVENT-RETENTION-003 | Cutoff-equal, newer, out-of-scope, replay-guarded, recovery-guarded, and rollback-candidate rows are retained and reported through skipped counts. | Application + persistence/pg | Covered by `packages/application/test/domain-event-retention.test.ts` and `packages/persistence/pg/test/domain-event-stream-retention.pglite.test.ts`. |
| DOMAIN-EVENT-RETENTION-004 | CLI and HTTP/oRPC entrypoints dispatch `PruneDomainEventsCommand` through shared schema and command bus. | CLI + HTTP/oRPC | Covered by `packages/adapters/cli/test/domain-event-command.test.ts`, `packages/orpc/test/domain-events.http.test.ts`, `packages/application/test/operation-catalog-boundary.test.ts`, `packages/docs-registry/test/operation-coverage.test.ts`, and `packages/openapi/test/openapi-reference.test.ts`. |
| DOMAIN-EVENT-RETENTION-005 | Event stream reads report the governed stream-gap/error contract when a requested cursor is older than retained watermark state, and follow mode continues from retained stable cursors when retained stream state exists. | Query/contract + persistence/pg | Covered by `packages/application/test/stream-deployment-events.test.ts` and `packages/persistence/pg/test/domain-event-stream-retention.pglite.test.ts`. |

## Current Gaps

- ADR-059 selects `domain_event_stream_records` plus prune watermark state as the canonical first
  retained event observation store. Application and PGlite prune coverage exists for
  `DOMAIN-EVENT-RETENTION-001` through `DOMAIN-EVENT-RETENTION-003`.
- Discovery on 2026-05-12 found that `deployments.stream-events` was reconstructed from embedded
  deployment logs plus live progress observation. Code Round migrated retained replay, pruned
  cursor gap detection, and follow-mode cursor continuation to retained domain event stream rows
  when retained state exists.
- Code Round added retained-store bounded replay, retained deployment domain-event recording,
  pruned-cursor gap coverage, and retained follow-mode cursor continuation for
  `DOMAIN-EVENT-RETENTION-005`.
- Streams without retained rows still use the legacy observer fallback, and non-domain progress
  observation retention remains future observability hardening.
- Organization retention defaults and scheduled history retention automation are governed by
  ADR-060, ADR-061, and their own test matrices. ADR-054 defines durable process attempts as the
  current outbox/inbox-equivalent process state; that retention is governed separately by
  `operator-work.prune`.
