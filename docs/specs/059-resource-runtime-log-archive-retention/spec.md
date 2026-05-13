# Resource Runtime Log Archive Retention

## Status

- Round: Code Round plus Post-Implementation Sync
- Artifact state: implemented

## Business Outcome

Operators can explicitly capture and retain a bounded snapshot of resource runtime logs for support,
delete-safety review, and incident context without changing the live `resources.runtime-logs`
observation contract or claiming ownership of external runtime log stores.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Runtime log observation | Live or bounded read of application stdout/stderr through `resources.runtime-logs`. | Resource runtime observation | runtime logs |
| Runtime log archive snapshot | Appaloft-owned retained record containing a bounded, redacted capture from runtime log observation plus safe context metadata. | Operator retention | archived runtime logs |
| Runtime log archive retention | Policy for retaining or pruning Appaloft-owned runtime log archive snapshots. | Operator maintenance | runtime-log retention |
| Runtime log archive prune | Dry-run-first deletion of old Appaloft-owned runtime log archive snapshots selected by cutoff and safe scope. | Operator maintenance | runtime log cleanup |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| RUNTIME-LOG-ARCHIVE-001 | Explicit archive capture | a resource has an observable runtime instance | `resources.runtime-logs.archive` is requested with bounded options | Appaloft captures a bounded redacted snapshot with safe resource/deployment/server/service metadata. |
| RUNTIME-LOG-ARCHIVE-002 | Archive readback | retained archive snapshots exist for a visible resource | list/show archive queries run | only safe metadata and redacted lines are returned. |
| RUNTIME-LOG-ARCHIVE-003 | Dry-run prune by default | old archive snapshots exist before `before` | prune omits `dryRun` | matching counts are returned and no archive snapshot is deleted. |
| RUNTIME-LOG-ARCHIVE-004 | Destructive prune | old archive snapshots exist before `before` | prune sets `dryRun = false` | only matching archive snapshot records are deleted; live backend logs and other Appaloft retention stores are untouched. |
| RUNTIME-LOG-ARCHIVE-005 | Delete-safety blocker | retained archive snapshots reference a resource or server | delete safety checks run | blocker kind `runtime-log-retention` is reported with safe counts/ids only. |
| RUNTIME-LOG-ARCHIVE-006 | Entrypoint dispatch | CLI, HTTP/oRPC, SDK, Web, or future MCP activates the operation | inputs are parsed | adapters dispatch through `CommandBus` or `QueryBus` using shared application schemas. |

## Domain Ownership

- Bounded context: Workload Delivery / Resource runtime observation, with operator retention read
  model ownership for archive snapshot records.
- Aggregate/resource owner: Resource owns runtime log observation identity; archive snapshots are
  retained read-model records, not Resource aggregate state.
- Upstream/downstream contexts: runtime target adapters supply normalized runtime log events;
  resource/server delete safety observes retained archive snapshot records as blockers.

## Public Surfaces

- API: active `POST /api/resources/{resourceId}/runtime-log-archives`,
  `GET /api/resources/runtime-log-archives`,
  `GET /api/resources/runtime-log-archives/{archiveId}`, and
  `POST /api/resources/runtime-log-archives/prune`.
- CLI: active `appaloft resource log-archives archive <resourceId>`,
  `appaloft resource log-archives list`, `appaloft resource log-archives show <archiveId>`, and
  `appaloft resource log-archives prune --before <iso>`.
- Web/UI: future operator maintenance and Resource diagnostics surfaces may create/read/prune
  archive snapshots after showing safe context.
- Config: none in this slice.
- Events: none required for the first archive/prune slice.
- Public docs/help: runtime log observability help coverage points at the active archive/prune
  operations and stable help anchors.

## Non-Goals

- Persisting every live runtime log line by default.
- Mutating, pruning, or deleting external Docker, Compose, Swarm, SSH, PM2, systemd, file-tail, or
  provider-native log stores.
- Replacing `resources.runtime-logs`, `deployments.logs`, provider job logs, audit rows, event
  streams, outbox/inbox records, process attempts, deployment snapshots, runtime artifacts, source
  workspaces, or build cache retention.
- Legal holds, immutable archive storage, organization-level retention defaults, global export, log
  search, log drains, and metrics.

## Current Implementation Notes And Migration Gaps

- Archive capture, list/show, dry-run/default prune, destructive prune, delete-safety blockers, CLI
  dispatch, HTTP/oRPC dispatch, operation catalog rows, docs registry coverage, and persistence are
  implemented.
- Destructive prune without resource/server/deployment scope does not require a separate
  confirmation token in this slice; it remains dry-run-first and requires explicit
  `dryRun = false`.
- Legal hold, immutable archive, organization defaults, and scheduled history retention automation
  are governed by separate Phase 9 slices. Search, drains, metrics, and Web maintenance affordances
  remain future governed slices.
