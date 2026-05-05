# Scheduled Task Resource Shape

## Status

Code Round in progress.

## Problem

Operators need recurring and manually triggered workload tasks such as migrations, sync jobs, cache
warmers, and maintenance scripts. These tasks need schedules, run history, logs, failures, and
safe retry behavior without confusing them with deployments or hiding them as server cron.

## Source Of Truth

- [ADR-039: Scheduled Task Resource Ownership](../../decisions/ADR-039-scheduled-task-resource-ownership.md)
- [Async Lifecycle And Acceptance](../../architecture/async-lifecycle-and-acceptance.md)
- [Business Operation Map](../../BUSINESS_OPERATION_MAP.md)
- [Scheduled Task Resource Shape Test Matrix](../../testing/scheduled-task-resource-test-matrix.md)

## Target Operations

These operations are accepted candidates, not active catalog entries yet:

| Operation | Kind | Purpose |
| --- | --- | --- |
| `scheduled-tasks.create` | Command | Create a Resource-owned scheduled task definition. |
| `scheduled-tasks.list` | Query | List task definitions for a Resource/project/environment context. |
| `scheduled-tasks.show` | Query | Show one task definition with latest run summary. |
| `scheduled-tasks.update` | Command | Change enabled state, schedule, command intent, timeout, retry, or concurrency policy. |
| `scheduled-tasks.delete` | Command | Remove or archive a task definition after safety checks. |
| `scheduled-tasks.run-now` | Command | Accept an immediate run attempt for one task. |
| `scheduled-task-runs.list` | Query | List run attempts for a task or Resource. |
| `scheduled-task-runs.show` | Query | Show one run attempt detail. |
| `scheduled-task-runs.logs` | Query | Read one run attempt's logs. |

## Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| SCHED-TASK-SPEC-001 | Task definition is Resource-owned | A user creates a scheduled task for a Resource | Command is accepted | The task stores Resource id, schedule, command intent, lifecycle state, timeout/retry/concurrency policy, and no deployment id. |
| SCHED-TASK-SPEC-002 | Run-now is acceptance-first | A task is enabled and Resource profile is runnable | User dispatches run-now | Command returns `ok({ runId })`; completion is visible later through run detail/logs. |
| SCHED-TASK-SPEC-003 | Scheduler uses same admission | A due enabled task exists | Internal scheduler fires | It dispatches the same run admission path as run-now and records the same run-attempt shape. |
| SCHED-TASK-SPEC-004 | Runs do not become deployments | A scheduled task run starts | User lists deployments | Deployment history is unchanged; task run history shows the run. |
| SCHED-TASK-SPEC-005 | Logs are task-run scoped | A scheduled task run emits output | User reads logs | `scheduled-task-runs.logs` returns the run logs; deployment/resource runtime logs are unchanged. |
| SCHED-TASK-SPEC-006 | Concurrency is explicit | A previous run for the same task is non-terminal | Scheduler or run-now admits another run | Default `forbid` policy rejects or records a skipped run without starting another runtime execution. |
| SCHED-TASK-SPEC-007 | Secrets stay masked | Task command or environment references secrets | Definition, run, logs, errors, or diagnostics are read | Raw secret values are absent; only safe references, keys, scopes, and masked values appear. |
| SCHED-TASK-SPEC-008 | Resource archive blocks new runs | Resource is archived | Scheduler or user tries to run the task | Admission fails or skips before runtime execution with a structured resource lifecycle reason. |

## Public Docs Outcome

Docs Round required before completion. Target page: a future task-oriented public docs page under
Resources or Observe explaining scheduled tasks, run history, logs, and failure recovery without
DDD or internal process-manager terminology.

## Migration Gaps

- Core scheduled task definition value objects and Resource-owned definition state exist for
  schedule, timezone, command intent, timeout, retry, lifecycle status, and `forbid` concurrency
  validation.
- Core scheduled task run attempts exist with Resource/task ownership, manual or scheduled trigger
  kind, accepted/running/succeeded/failed/skipped lifecycle state, timestamps, safe exit/failure
  summary fields, and no Deployment id.
- Inactive application command/query schemas, messages, result DTOs, and read-model ports exist
  for the target scheduled-task and scheduled-task-run operations. They are not active operation
  catalog entries and have no handlers/use cases yet.
- Inactive application create admission exists. It loads the owning Resource, rejects
  archived/deleted Resources before storing the task, validates schedule/timezone/command
  intent/timeout/retry/status/concurrency through core value objects, and stores a Resource-owned
  task definition through the scheduled-task definition repository port.
- Inactive application update admission exists. It loads the Resource-owned task and Resource,
  rejects archived/deleted Resources before storing changes, validates every patched field through
  core value objects, and persists through the same scheduled-task definition repository port.
- Inactive application delete admission exists. It loads the Resource-owned task, verifies Resource
  ownership and Resource existence, deletes through an explicit scheduled-task definition repository
  mutation spec, and returns a timestamped delete result.
- Inactive application read-query handlers/services exist for task list/show, run list/show, and
  run logs. They wrap scheduled-task read-model ports with stable schema versions and generated
  timestamps but do not activate persistence, operation catalog entries, or entrypoints.
- Inactive application run-now admission exists. It loads the Resource-owned task, rejects disabled
  tasks or archived/deleted Resources before runtime execution, records an accepted manual run
  attempt, and returns a run id without starting the task command synchronously.
- Inactive application scheduler admission exists. It reads due scheduled-task candidates through
  a scheduler-specific port, dispatches each due candidate through the same shared run admission
  service as run-now, records accepted `scheduled` trigger runs, and reports per-candidate
  admission failures without starting runtime execution.
- Inactive scheduled-task runtime adapter support exists. The application owns a one-off task
  runtime port contract, and the runtime adapter package provides a hermetic implementation that
  returns scheduled-task-run-scoped stdout/stderr log entries, terminal status, exit code,
  timestamps, and masked secret-looking output without using deployment/resource runtime logs.
- Inactive accepted-run worker support exists. It loads an accepted run attempt, loads the owning
  task definition, persists the running transition, invokes the scheduled-task runtime port,
  records runtime logs through the scheduled-task run-log recorder, and persists the terminal
  succeeded or failed run state.
- Scheduled task definition persistence exists for Postgres/PGlite. It stores Resource-owned task
  definitions, supports repository find/upsert/delete through explicit specs, and supports
  list/show read-model filtering by project, environment, Resource, status, cursor, and limit.
- Scheduled task run-attempt persistence exists for Postgres/PGlite. It stores accepted, running,
  succeeded, failed, and skipped run attempts, supports repository upsert through explicit specs,
  supports run list/show filtering by task, Resource, status, trigger kind, cursor, and limit, and
  exposes latest run summaries on task list/show read models.
- Scheduled task run-log persistence exists for Postgres/PGlite. It stores log entries in a
  scheduled-task-run-specific table, reads them through the run-log read model by run/task/Resource,
  pages by log timestamp cursor, and masks secret-looking log messages before returning read-model
  entries.
- Scheduled task due-candidate read-model support exists for Postgres/PGlite. It scans enabled
  task definitions, evaluates the accepted schedule subset for the current timezone-aware minute,
  and suppresses candidates already admitted as scheduled runs in that same minute.
- Shell composition registrations exist for scheduled-task repositories, read models, due-candidate
  reader, run-log recorder, runtime port, handlers, use cases, scheduler, and accepted-run worker.
  An opt-in scheduled task runner config can start a shell timer that scans due tasks and drains
  admitted runs through the worker in long-running shell processes.
- No operation catalog entries are active.
- No Web, CLI, HTTP/oRPC, or MCP descriptors are active for scheduled tasks.
- The scheduled task runner is disabled by default until public entrypoints and docs are activated.
