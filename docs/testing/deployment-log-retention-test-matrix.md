# Deployment Log Retention Test Matrix

This matrix governs embedded deployment log retention behavior for `deployments.logs.prune`.

| Test ID | Scenario | Layer | Automation |
| --- | --- | --- | --- |
| DEP-LOG-PRUNE-001 | `deployments.logs.prune` defaults to dry-run and deletes no embedded log entries. | Application | Automated in `packages/application/test/deployment-log-retention.test.ts`. |
| DEP-LOG-PRUNE-002 | Destructive mode removes only old matching embedded log entries and returns counts. | Application | Automated in `packages/application/test/deployment-log-retention.test.ts`. |
| DEP-LOG-PRUNE-003 | Cutoff-equal, newer, and out-of-scope deployment/resource/server log entries are retained; deployment rows and metadata remain intact. | Persistence/pg | Automated in `packages/persistence/pg/test/deployment-log-retention.pglite.test.ts`. |
| DEP-LOG-PRUNE-004 | CLI and HTTP/oRPC dispatch `PruneDeploymentLogsCommand` through the shared schema. | CLI + HTTP/oRPC | Automated in `packages/adapters/cli/test/deployment-log-command.test.ts` and `packages/orpc/test/deployment-logs.http.test.ts`. |

## Out Of Scope

- Resource runtime log archival.
- Provider job log retention.
- Audit event retention or export holds.
- Domain event stream, outbox/inbox, or process-attempt retention.
- Scheduled retention automation, legal holds, organization defaults, and immutable archive export.
