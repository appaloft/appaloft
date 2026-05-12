# Resource Runtime Log Archive Retention Test Matrix

This matrix governs Appaloft-owned runtime log archive snapshots. It does not govern live
runtime log observation, external backend log stores, deployment logs, provider job logs, audit
rows, event streams, or outbox/inbox records.

| Test ID | Scenario | Layer | Automation |
| --- | --- | --- | --- |
| RUNTIME-LOG-ARCHIVE-001 | `resources.runtime-logs.archive` captures only bounded redacted line events from the `resources.runtime-logs` reader contract with safe resource/deployment/server/service metadata. | Application | Automated in `packages/application/test/resource-runtime-log-archives.test.ts`. |
| RUNTIME-LOG-ARCHIVE-002 | Archive list/show returns safe metadata and redacted lines without backend-native Docker/Compose/Swarm/SSH/provider objects. | Application + persistence | Automated in `packages/application/test/resource-runtime-log-archives.test.ts` and `packages/persistence/pg/test/resource-runtime-log-archive-store.pglite.test.ts`. |
| RUNTIME-LOG-ARCHIVE-003 | `resources.runtime-log-archives.prune` defaults to dry-run and deletes no archive snapshot records. | Application | Automated in `packages/application/test/resource-runtime-log-archives.test.ts`. |
| RUNTIME-LOG-ARCHIVE-004 | Destructive prune removes only old matching archive snapshot records and leaves live backend logs, deployment logs, provider job logs, audit rows, event streams, process attempts, snapshots, runtime artifacts, and business state untouched. | Persistence/pg | Automated in `packages/persistence/pg/test/resource-runtime-log-archive-store.pglite.test.ts`. |
| RUNTIME-LOG-ARCHIVE-005 | Resource/server delete safety reports `runtime-log-retention` only when retained Appaloft archive snapshots still reference the resource or server. | Application + persistence | Automated in `packages/persistence/pg/test/resource-runtime-log-archive-store.pglite.test.ts`. |
| RUNTIME-LOG-ARCHIVE-006 | CLI and HTTP/oRPC archive/list/show/prune entrypoints dispatch through shared application command/query schemas. | CLI + HTTP/oRPC | Automated in `packages/adapters/cli/test/resource-runtime-log-archive-command.test.ts` and `packages/orpc/test/resource-runtime-log-archives.http.test.ts`. |

## Out Of Scope

- `resources.runtime-logs` live or bounded observation behavior.
- External runtime backend log store retention or deletion.
- Embedded Deployment log retention.
- Provider job log retention.
- Audit event retention, export holds, domain event streams, outbox/inbox, process attempts,
  scheduled retention automation, legal holds, organization defaults, immutable archive export,
  search, drains, and metrics.
