# Provider Job Log Retention Test Matrix

## Scope

This matrix governs provider job log retention behavior for the `provider-job-logs.prune`
operator maintenance command.

## Matrix

| ID | Behavior | Level | Automation |
| --- | --- | --- | --- |
| PROV-JOB-LOG-PRUNE-001 | `provider-job-logs.prune` defaults to dry-run and deletes nothing. | Application | Automated in `packages/application/test/provider-job-log-retention.test.ts`. |
| PROV-JOB-LOG-PRUNE-002 | Destructive prune deletes only old matching provider job log rows and returns counts by provider key. | Application/persistence | Automated in `packages/application/test/provider-job-log-retention.test.ts` and `packages/persistence/pg/test/provider-job-log-retention.pglite.test.ts`. |
| PROV-JOB-LOG-PRUNE-003 | Cutoff-equal, newer, and out-of-scope deployment/provider/resource/server rows are retained; deployment rows and embedded deployment logs are untouched. | Persistence/pg | Automated in `packages/persistence/pg/test/provider-job-log-retention.pglite.test.ts`. |
| PROV-JOB-LOG-PRUNE-004 | CLI and HTTP/oRPC entrypoints dispatch `PruneProviderJobLogsCommand` through the command bus with shared command input schema. | CLI/oRPC/docs registry | Automated in `packages/adapters/cli/test/provider-job-log-command.test.ts`, `packages/orpc/test/provider-job-logs.http.test.ts`, and `packages/docs-registry/test/operation-coverage.test.ts`. |

## Current Gaps

- This matrix covers retained provider job log rows only.
- Deployment log retention, resource runtime log archival, domain event stream retention, audit
  export, legal holds, immutable archives, organization retention defaults, scheduled history
  retention, and durable process-attempt retention are governed by separate matrices.
