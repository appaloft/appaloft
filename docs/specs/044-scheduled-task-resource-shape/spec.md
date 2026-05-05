# Scheduled Task Resource Shape

## Status

Spec Round: positioned; Code Round not started.

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
- Inactive application run-now admission exists. It loads the Resource-owned task, rejects disabled
  tasks or archived/deleted Resources before runtime execution, records an accepted manual run
  attempt, and returns a run id without starting the task command synchronously.
- No operation catalog entries are active.
- No Web, CLI, HTTP/oRPC, or MCP descriptors are active for scheduled tasks.
- No persisted scheduled-task/run state exists.
- No scheduler process manager or runtime adapter execution path exists.
