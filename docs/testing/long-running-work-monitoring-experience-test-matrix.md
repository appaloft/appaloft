# Long-Running Work Monitoring Experience Test Matrix

This matrix governs `LONG-WORK-MON-*` behavior from
`docs/specs/095-long-running-work-monitoring-experience/spec.md`.

| ID | Layer | Behavior | Evidence |
| --- | --- | --- | --- |
| LONG-WORK-MON-001 | Deployment progress | Deployment events remain the ordinary user-facing progress surface for accepted durable deployments. | Existing deployment event stream coverage plus durable deployment worker tests; future UI regression should assert deployment detail does not require `workId`. |
| LONG-WORK-MON-002 | Deployment logs | Deployment logs stay deployment-scoped and do not render worker lease/dead-letter metadata. | Existing deployment logs/query/Web coverage; future regression should assert worker fields are absent from deployment log rendering. |
| LONG-WORK-MON-003 | Task progress | Parent workflows summarize child deployments instead of exposing raw worker categories. | Product-specific follow-up specs, beginning with Cloud InstalledApplication progress. |
| LONG-WORK-MON-004 | Operator work | `appaloft work show <workId>` and `/api/operator-work/{workId}` expose safe durable work details for admin/debug use. | `packages/adapters/cli/test/operator-work-command.test.ts`, `packages/orpc/test/operator-work.http.test.ts`, and `packages/application/test/operator-work-query.test.ts`. |
| LONG-WORK-MON-005 | Worker runtime topology | Instance maintenance readback shows durable worker runtime label, safety copy, activation, and configured topology. | `apps/web/src/lib/console/auth-management.test.ts` plus `apps/shell/test/maintenance-worker-status-reader.test.ts`. |
| LONG-WORK-MON-006 | Worker heartbeat | Durable worker heartbeat is stored separately from deployment logs and rendered only on admin/doctor worker status surfaces as online/stale summary. | `apps/shell/test/maintenance-worker-status-reader.test.ts`, `apps/web/src/lib/console/auth-management.test.ts`, and `packages/server/test/durable-work-runtime.test.ts`. |
| LONG-WORK-MON-007 | CLI command names | Generated monitoring commands match implemented CLI: `appaloft work list/show` and `appaloft deployments events ... --follow`. | `packages/contracts/test/quick-deploy-workflow.test.ts`. |
