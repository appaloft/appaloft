# Operator Work Ledger Test Matrix

## Normative Contract

Tests for operator work ledger visibility must prove that operators can list and show safe
background work state without exposing recovery mutations or secret-bearing detail.

## Global References

- [Operator Work Ledger Spec](../specs/010-operator-work-ledger/spec.md)
- [operator-work.list](../queries/operator-work.list.md)
- [operator-work.show](../queries/operator-work.show.md)
- [operator-work.stream-events](../queries/operator-work.stream-events.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [Error Model](../errors/model.md)
- [ADR-016](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-028](../decisions/ADR-028-command-coordination-scope-and-mutation-admission.md)
- [ADR-029](../decisions/ADR-029-deployment-event-stream-and-recovery-boundary.md)

## Matrix

| Test ID | Layer | Case | Expected result |
| --- | --- | --- | --- |
| OP-WORK-CATALOG-001 | catalog | `operator-work.list` and `operator-work.show` are active queries | Catalog entries expose CLI and HTTP/oRPC transports and schemas. |
| OP-WORK-QRY-001 | application | Deployment attempt aggregation | Deployment read-model rows become `kind = deployment` work items with deployment ids and read-only next actions. |
| OP-WORK-QRY-002 | application | Proxy bootstrap aggregation | Server edge proxy read-model state becomes `kind = proxy-bootstrap` work items without user workload mutation. |
| OP-WORK-QRY-003 | application | Certificate attempt aggregation | Latest certificate attempts become `kind = certificate` work items with safe related ids. |
| OP-WORK-QRY-004 | application | Filters | `kind`, `status`, `resourceId`, `serverId`, `deploymentId`, and `limit` filter the aggregate list. |
| OP-WORK-QRY-005 | application | Show one item | `operator-work.show` returns the matching item or `not_found`. |
| OP-WORK-QRY-006 | application | Durable process attempt merge | Durable process attempts are read before legacy aggregation and win when the same work id appears in both sources. |
| OP-WORK-QRY-007 | application | Source-link aggregation | Safe source-link read-model rows become `kind = system` work items for `source-links.relink` without exposing credential-bearing source locators. |
| OP-WORK-QRY-008 | application | Route-realization aggregation | Persisted route realization summaries become `kind = route-realization` work items with safe route scope, status, error, and next-action metadata. |
| OP-WORK-QRY-009 | application | Worker/job process status | Durable process attempts for scheduler, runtime-maintenance, worker, or job status are visible without synthesizing status from logs or in-memory state. |
| OP-WORK-QRY-010 | application | Remote SSH state aggregation | Safe remote-state read-model rows become `kind = remote-state` work items for locks, migrations, backups, and recovery markers without acquiring locks, recovering stale locks, running migrations, restoring backups, exposing raw PGlite content, or exposing SSH private key paths. |
| OP-WORK-QRY-011 | shell / CLI | Remote SSH diagnostics producer | The SSH remote-state diagnostics producer reads lock, migration journal, backup, and recovery marker metadata without mutating remote state, and the shell read model converts output into safe remote-state rows. |
| OP-WORK-STREAM-001 | application | Durable work parent status replay | `operator-work.stream-events` returns stable accepted/running/progress/succeeded/failed/canceled/dead-lettered envelopes with safe parent work fields only. |
| OP-WORK-STREAM-002 | application | Stream safety redaction | Work stream envelopes omit worker id, worker group, lease owner, heartbeat rows, internal attempt counters, command lines, credentials, and raw log payloads. |
| OP-WORK-STREAM-003 | application | Follow close | Follow mode emits replay/history, then closes after terminal durable work status when `untilTerminal = true`. |
| OP-WORK-JOURNAL-001 | application | Process attempt recorder contract | Recorder writes pending/running/terminal process attempt state with operation key, dedupe key, correlation/request ids, related ids, error fields, next actions, and safe details. |
| OP-WORK-JOURNAL-002 | persistence/pg | Process attempt journal migration and adapter | Migration creates a durable process attempt table and the PG adapter can upsert, list, filter, show, and preserve only safe details. |
| OP-WORK-JOURNAL-003 | persistence/pg | Process attempt retry candidates | PG journal lists due `retry-scheduled` attempts by optional kind and limit, skips future retries, and treats the latest row for a dedupe key as the retry authority, including skipping stale `retry-scheduled` rows superseded by newer terminal rows. |
| OP-WORK-MARK-RECOVERED-001 | application | Mark failed durable process attempt recovered | `operator-work.mark-recovered` changes a failed process attempt to `succeeded`, records safe recovery metadata, clears retry eligibility, and leaves related ids intact; scheduled-task durable work recovery remains a process-state annotation and does not mutate scheduled-task run state. |
| OP-WORK-MARK-RECOVERED-002 | application | Block non-recoverable statuses | Pending, running, succeeded, canceled, and unknown attempts reject with `operator_work_recovery_not_allowed` without recording an update. |
| OP-WORK-MARK-RECOVERED-003 | application | Missing durable row | Unknown work ids reject with `operator_work_not_found`; compatibility ledger rows aggregated from other read models are not mutated. |
| OP-WORK-MARK-RECOVERED-004 | persistence/pg | Overwrite recovered journal row | PG process attempt journal can persist a recovered row that clears stale `nextEligibleAt`, retry guidance, and previous error fields. |
| OP-WORK-DEAD-LETTER-001 | application | Dead-letter failed or retry-scheduled durable process attempt | `operator-work.dead-letter` changes a failed or retry-scheduled process attempt to `dead-lettered`, records safe dead-letter metadata, clears retry eligibility, and leaves related ids intact. |
| OP-WORK-DEAD-LETTER-002 | application | Block non-dead-letterable statuses | Pending, running, succeeded, canceled, dead-lettered, and unknown attempts reject with `operator_work_dead_letter_not_allowed` without recording an update. |
| OP-WORK-DEAD-LETTER-003 | application | Missing durable row | Unknown work ids reject with `operator_work_not_found`; compatibility ledger rows aggregated from other read models are not mutated. |
| OP-WORK-DEAD-LETTER-004 | persistence/pg | Overwrite dead-lettered journal row | PG process attempt journal can persist a dead-lettered row that clears stale `nextEligibleAt`, retry guidance, and previous retriable state, and excludes the row from due retry selection. |
| OP-WORK-CANCEL-001 | application | Cancel pending or retry-scheduled durable process attempt | `operator-work.cancel` changes a pending or retry-scheduled process attempt to `canceled`, records safe cancel metadata, clears retry eligibility, and leaves related ids intact; scheduled-task durable work cancellation remains a process-state annotation and does not mutate scheduled-task run state. |
| OP-WORK-CANCEL-002 | application | Block non-cancelable statuses | Running, succeeded, failed, canceled, dead-lettered, and unknown attempts reject with `operator_work_cancel_not_allowed` without recording an update. |
| OP-WORK-CANCEL-003 | application | Missing durable row | Unknown work ids reject with `operator_work_not_found`; compatibility ledger rows aggregated from other read models are not mutated. |
| OP-WORK-CANCEL-004 | persistence/pg | Overwrite canceled journal row | PG process attempt journal can persist a canceled row that clears stale `nextEligibleAt`, retry guidance, and previous retriable state. |
| OP-WORK-RETRY-001 | application | Retry failed or retry-scheduled durable process attempt | `operator-work.retry` creates a new pending process attempt with a fresh id, safe retry lineage, preserved related ids, no stale retry timing, no previous error fields, and `nextActions = ["no-action"]`; scheduled-task durable work retry remains a pending annotation and does not execute runtime work by itself. |
| OP-WORK-RETRY-002 | application | Block non-retryable attempts | Pending, running, succeeded, canceled, dead-lettered, unknown, and rows without `retriable = true` reject with `operator_work_retry_not_allowed` without recording a new attempt. |
| OP-WORK-RETRY-003 | application | Missing durable row | Unknown work ids reject with `operator_work_not_found`; compatibility ledger rows aggregated from other read models are not mutated. |
| OP-WORK-RETRY-004 | persistence/pg | Insert retry journal row | PG process attempt journal can insert a new retry attempt that preserves dedupe lineage, uses a retry-specific dedupe key, clears the original attempt's retry eligibility, and does not overwrite the original attempt id. |
| OP-WORK-PRUNE-001 | application | Dry-run old terminal durable process attempts | `operator-work.prune` with omitted or true `dryRun` returns counts for old `succeeded`, `failed`, `canceled`, and `dead-lettered` durable attempts without deleting rows. |
| OP-WORK-PRUNE-002 | application | Destructive prune old terminal durable process attempts | `operator-work.prune` with `dryRun = false` deletes only old terminal durable attempts and reports the deleted count and counts by status. |
| OP-WORK-PRUNE-003 | application | Retain non-prunable and cutoff-equal rows | Pending, running, retry-scheduled, unknown, and rows with `updatedAt >= before` are retained. |
| OP-WORK-PRUNE-004 | persistence/pg | Prune journal rows by cutoff and terminal status | PG process attempt journal counts or deletes only matching terminal rows, keeps dry-run non-mutating, and retains non-prunable rows. |
| OP-WORK-REDAC-001 | application | No secret leakage | Work items do not include raw log messages, environment values, private keys, certificate material, or provider command lines. |
| OP-WORK-ENTRY-001 | CLI | `appaloft work list` dispatches query | CLI dispatches `ListOperatorWorkQuery`. |
| OP-WORK-ENTRY-002 | CLI | `appaloft work show <workId>` dispatches query | CLI dispatches `ShowOperatorWorkQuery`. |
| OP-WORK-ENTRY-003A | CLI | `appaloft work events <workId> --follow --json` dispatches stream query | CLI consumes the stream, prints normalized envelopes, and exits after `closed`. |
| OP-WORK-ENTRY-003 | HTTP/oRPC | HTTP list/show dispatch | HTTP routes dispatch the shared query schemas. |
| OP-WORK-ENTRY-003B | HTTP/oRPC | HTTP stream dispatch | HTTP routes expose bounded and streaming operator-work event routes through the shared query schema. |
| OP-WORK-ENTRY-003C | SDK | TypeScript SDK stream helper | Generated SDK metadata can wrap the streaming route as an `AsyncIterable` of operator-work envelopes. |
| OP-WORK-ENTRY-004 | CLI | `appaloft work mark-recovered <workId>` dispatches command | CLI dispatches `MarkOperatorWorkRecoveredCommand` with optional safe reason. |
| OP-WORK-ENTRY-005 | HTTP/oRPC | HTTP mark-recovered dispatch | HTTP route dispatches the shared command schema. |
| OP-WORK-ENTRY-006 | CLI | `appaloft work dead-letter <workId>` dispatches command | CLI dispatches `DeadLetterOperatorWorkCommand` with required safe reason. |
| OP-WORK-ENTRY-007 | HTTP/oRPC | HTTP dead-letter dispatch | HTTP route dispatches the shared command schema. |
| OP-WORK-ENTRY-008 | CLI | `appaloft work cancel <workId>` dispatches command | CLI dispatches `CancelOperatorWorkCommand` with required safe reason. |
| OP-WORK-ENTRY-009 | HTTP/oRPC | HTTP cancel dispatch | HTTP route dispatches the shared command schema. |
| OP-WORK-ENTRY-010 | CLI | `appaloft work retry <workId>` dispatches command | CLI dispatches `RetryOperatorWorkCommand` with optional safe reason. |
| OP-WORK-ENTRY-011 | HTTP/oRPC | HTTP retry dispatch | HTTP route dispatches the shared command schema. |
| OP-WORK-ENTRY-012 | CLI | `appaloft work prune --before <iso>` dispatches command | CLI dispatches `PruneOperatorWorkCommand` with the shared cutoff, status, and dry-run schema. |
| OP-WORK-ENTRY-013 | HTTP/oRPC | HTTP prune dispatch | HTTP route dispatches the shared command schema. |
| OP-WORK-DOCS-001 | docs | Public docs registry coverage | Operator work operation keys map to the operator work ledger help topic. |

## Current Implementation Notes

This matrix begins with durable process attempt journal reads plus deployment, proxy-bootstrap,
certificate, remote-state, source-link, and route-realization aggregation. Aggregate-scoped audit
event read surfaces are covered by
[Audit Event Read Surface Test Matrix](./audit-event-read-surface-test-matrix.md). Remote-state
stale-lock recovery and migration execution are covered by the SSH remote-state lifecycle and CLI
diagnostics; remote-state backup and recovery markers are read into the operator-work ledger as
safe diagnostics. Runtime artifact/workspace prune, including explicit old remote-state marker
cleanup, is governed by `servers.capacity.prune` rather than `operator-work.*`.
`operator-work.mark-recovered`, `operator-work.dead-letter`, `operator-work.cancel`,
`operator-work.retry`, and `operator-work.prune` are limited to durable process attempt ledger rows
and do not repair or delete runtime or remote-state resources. Runtime/provider cancellation
requires workflow-specific commands such as `deployments.cancel` or `resources.runtime.stop`,
instead of generic operator-work mutation.
