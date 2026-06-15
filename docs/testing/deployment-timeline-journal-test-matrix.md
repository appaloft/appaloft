# Deployment Timeline Journal Test Matrix

This matrix governs the unified Deployment Timeline Journal selected by ADR-084.

| Test ID | Scenario | Layer | Automation |
| --- | --- | --- | --- |
| DEP-TIMELINE-001 | Appaloft lifecycle progress and SSH/Docker/application output are persisted as one ordered journal. | Application + persistence | Required in Code Round. |
| DEP-TIMELINE-002 | Create-time modal streaming and deployment-detail replay render the same entry shape. | Web + application | Required in Code Round. |
| DEP-TIMELINE-003 | Logs tab/CLI log view filters timeline entries instead of calling a separate deployment-log query. | Web + CLI | Required in Code Round. |
| DEP-TIMELINE-004 | Cursor replay and follow continue strictly after the last observed timeline cursor. | Application + HTTP/oRPC | Required in Code Round. |
| DEP-TIMELINE-005 | Domain-event retention rows are not used as the deployment UI timeline source. | Application + persistence | Required in Code Round. |
| DEP-TIMELINE-006 | Operation catalog, generated SDK fixtures, CLI, HTTP/oRPC, and docs no longer expose `deployments.logs`, `deployments.logs.prune`, or `deployments.stream-events`. | Docs + catalog + adapters | Required in Code Round. |

## Out Of Scope

- Backfilling old embedded deployment logs.
- Event sourcing.
- Provider-native runtime log archive retention.
- New deployment mutation commands.
