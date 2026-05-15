# Dependency Resource Scheduled Backup Policy

## Status

- Round: Code Round
- Artifact state: implemented-first-slice

## Business Outcome

Operators can define an opt-in backup cadence for managed dependency resources so routine
Postgres/Redis restore points can be created by Appaloft without introducing a second provider
backup path or exposing raw dump material.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Dependency resource backup policy | A persisted schedule and retention metadata record for one dependency resource. | Dependency Resources | scheduled backup policy |
| Scheduled dependency backup runner | Disabled-by-default shell worker that scans due backup policies and dispatches the existing backup command. | Shell/runtime | backup scheduler |
| Due backup policy | An enabled policy whose `nextRunAt` is at or before the worker's `dueAt` timestamp. | Dependency Resources | due schedule |
| Backup retention metadata | Operator intent for how long generated restore points should be retained. | Dependency Resources | retention policy |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| DEP-BACKUP-POLICY-001 | Configure policy | a dependency resource exists or will exist under a known id | an operator configures a policy | Appaloft persists policy id, dependency resource id, interval hours, retention days, enabled state, retry preference, optional provider key, and next run timestamp without running a backup immediately. |
| DEP-BACKUP-POLICY-002 | Read policies | policies exist across resources | an operator lists or shows policies | Appaloft returns safe policy metadata only and supports filtering by dependency resource, enabled state, and due timestamp. |
| DEP-BACKUP-POLICY-003 | Scheduled execution | an enabled policy is due | the scheduled dependency backup runner ticks | Appaloft records safe process-attempt visibility, dispatches `dependency-resources.create-backup`, and advances `lastRunAt` plus `nextRunAt` after successful backup admission. |
| DEP-BACKUP-POLICY-004 | Existing backup boundary remains authoritative | a policy is due | the runner dispatches work | backup admission, provider capability checks, raw secret handling, backup state, and restore point safety remain owned by `dependency-resources.create-backup`. |
| DEP-BACKUP-POLICY-005 | Failure is visible and bounded | scheduled backup dispatch fails | the runner records the attempt | Appaloft records failed or retry-scheduled process-attempt state with safe details and does not call provider backup APIs directly. |
| DEP-BACKUP-POLICY-006 | Public surfaces are explicit | an operator uses CLI, HTTP/oRPC, Web, or future SDK/MCP surfaces | policy behavior is accessed | behavior uses `dependency-resources.backup-policies.configure/list/show` and existing backup operations rather than generic update endpoints. |

## Domain Ownership

- Bounded context: Dependency Resources.
- Aggregate/resource owner: backup policy state belongs to the dependency resource lifecycle read and
  command surface; backup artifacts remain `DependencyResourceBackup` state.
- Upstream/downstream contexts: shell runner owns periodic scanning; provider-specific backup
  capabilities stay inside provider packages and existing backup use cases.

## Public Surfaces

- API: `POST /api/dependency-resources/backup-policies`,
  `GET /api/dependency-resources/backup-policies`, and
  `GET /api/dependency-resources/backup-policies/{policyId}`.
- CLI: `appaloft dependency backup policy configure/list/show`.
- Web/UI: `/dependency-resources` exposes policy controls for the selected dependency resource.
- Config: `APPALOFT_SCHEDULED_DEPENDENCY_BACKUP_RUNNER_ENABLED`,
  `APPALOFT_SCHEDULED_DEPENDENCY_BACKUP_RUNNER_INTERVAL_SECONDS`, and
  `APPALOFT_SCHEDULED_DEPENDENCY_BACKUP_RUNNER_BATCH_SIZE`.
- Public docs/help: dependency resource lifecycle docs and configuration reference.

## Non-Goals

- Creating a provider-specific scheduler per database kind.
- Calling provider backup APIs directly from the runner.
- Backup prune/delete or artifact export.
- Provider-native credential rotation.
- Runtime restart, redeploy, or deployment snapshot mutation.
- Cross-resource restore.

## Current Implementation Notes And Migration Gaps

- Scheduled policy execution reuses `dependency-resources.create-backup`, so backup admission,
  provider capability checks, safe process details, and raw secret handling stay in the existing
  backup path.
- The shell runner is disabled by default and scans persisted policies when enabled.
- Retention days are persisted as policy intent. Backup prune/delete and export remain future
  slices.
