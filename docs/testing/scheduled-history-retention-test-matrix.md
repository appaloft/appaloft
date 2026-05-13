# Scheduled History Retention Automation Test Matrix

This matrix governs scheduled retention automation for retained Appaloft history categories. It does
not govern manual prune command semantics, scheduled runtime target artifact/workspace prune,
external provider log stores, Web maintenance controls, or future outbox/inbox stores that do not
yet exist.

| Test ID | Scenario | Layer | Automation |
| --- | --- | --- | --- |
| SCHED-HISTORY-RETENTION-001 | Enabled retention defaults compute category cutoffs and dispatch existing prune commands as dry-run by default. | Application + shell | Automated in `packages/application/test/scheduled-history-retention.test.ts` and `apps/shell/test/scheduled-history-retention-runner.test.ts`. |
| SCHED-HISTORY-RETENTION-002 | Destructive scheduled retention runs only when the selected retention default explicitly enables destructive scheduling for that category. | Application | Automated in `packages/application/test/scheduled-history-retention.test.ts`. |
| SCHED-HISTORY-RETENTION-003 | Legal holds, immutable archive guards, replay guards, active process attempts, recovery evidence, rollback-candidate evidence, and category-specific skip rules remain authoritative over scheduled retention defaults. | Application + persistence | Covered by command-bus-only scheduled dispatch in `packages/application/test/scheduled-history-retention.test.ts` plus existing category guard evidence in `packages/application/test/retention-defaults.test.ts`, `packages/application/test/domain-event-retention.test.ts`, and category retention persistence tests. |
| SCHED-HISTORY-RETENTION-004 | Accepted scheduled retention work records durable process attempts and exposes safe pending/running/succeeded/failed/retry-scheduled/dead-lettered/canceled/recovered details through operator work. | Application + shell + persistence | Application accepted/succeeded/retry-scheduled coverage is automated in `packages/application/test/scheduled-history-retention.test.ts`; shell failure logging is automated in `apps/shell/test/scheduled-history-retention-runner.test.ts`; dead-letter/cancel/recovered lifecycle remains covered by existing `operator-work.*` tests. |
| SCHED-HISTORY-RETENTION-005 | Retention defaults for unsupported scheduled categories are skipped visibly without direct repository/store calls. | Application | Automated in `packages/application/test/scheduled-history-retention.test.ts`. |
| SCHED-HISTORY-RETENTION-006 | Public surfaces remain existing `retention-defaults.*`, manual prune commands, and `operator-work.*`; the internal shell runner remains disabled by default and no parallel public scheduled-prune command is required for the first worker slice. | Shell config + docs/operation catalog | Covered by `packages/config/test/index.test.ts` and `apps/shell/test/scheduled-history-retention-runner.test.ts`; runtime env vars are documented at `reference/configuration#reference-scheduled-workers`; this Code Round adds no operation catalog entry, CLI command, HTTP/oRPC route, or public scheduled-prune command. |

## Current Gaps

- ADR-061 defines the scheduled worker boundary, and the first application service implementation
  now has disabled-by-default shell scheduler wiring without a public scheduled-retention
  entrypoint.
- ADR-054 durable process delivery is the current outbox/inbox-equivalent baseline. Accepted
  background-work retention is represented by durable process attempt retention through
  `operator-work.prune`; a separate outbox/inbox retention row is not applicable unless a future
  ADR introduces a separate outbox/inbox store.
