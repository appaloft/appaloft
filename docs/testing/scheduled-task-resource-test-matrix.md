# Scheduled Task Resource Test Matrix

## Scope

This matrix covers future Resource-owned scheduled task definitions, run attempts, run history, and
logs. It is not active implementation coverage yet.

## Global References

- [ADR-039: Scheduled Task Resource Ownership](../decisions/ADR-039-scheduled-task-resource-ownership.md)
- [Scheduled Task Resource Shape](../specs/044-scheduled-task-resource-shape/spec.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Coverage Rows

| ID | Layer | Scenario | Expected |
| --- | --- | --- | --- |
| SCHED-TASK-CATALOG-001 | Operation catalog | Scheduled task operations are activated. | `CORE_OPERATIONS.md` and `operation-catalog.ts` add one entry per accepted command/query in the same Code Round. |
| SCHED-TASK-DOMAIN-001 | Core domain | Valid scheduled task definition. | Value objects accept safe schedule, timezone, command intent, timeout, retry, and `forbid` concurrency policy. |
| SCHED-TASK-DOMAIN-002 | Core domain | Invalid schedule or unsafe command intent. | Factory returns structured validation error; no `any` or primitive domain state leaks into aggregate state. |
| SCHED-TASK-RUN-001 | Application command | User runs a task now. | Command returns `ok({ runId })` after admission; run state starts as accepted/pending/running according to workflow. |
| SCHED-TASK-RUN-002 | Application command | Resource is archived. | Run admission rejects or skips before runtime execution with a structured resource lifecycle phase. |
| SCHED-TASK-SCHED-001 | Scheduler | Enabled task is due. | Scheduler dispatches the same run admission path as run-now and records the same run shape. |
| SCHED-TASK-SCHED-002 | Scheduler/concurrency | Previous run is non-terminal. | Default `forbid` policy prevents concurrent runtime execution and records safe skip/rejection state. |
| SCHED-TASK-LOGS-001 | Query/log adapter | Run emits output. | `scheduled-task-runs.logs` reads run-scoped logs; deployment and resource runtime logs are unchanged. |
| SCHED-TASK-SECRET-001 | Redaction | Task input references secrets. | Definitions, runs, logs, errors, diagnostics, and tool descriptors expose only safe references and masked values. |
| SCHED-TASK-ENTRY-001 | CLI/API/Web/MCP | Entrypoints are active. | Each surface dispatches command/query messages through the catalog schemas; no generic task update or provider SDK shape appears. |

## Current Implementation Notes And Migration Gaps

`SCHED-TASK-DOMAIN-001` and `SCHED-TASK-DOMAIN-002` have core coverage in
`packages/core/test/scheduled-task.test.ts`. The implemented slice adds dedicated value objects for
schedule, timezone, command intent, timeout, retry, lifecycle status, and `forbid` concurrency
policy plus a Resource-owned scheduled task definition state with no deployment id.

No operation catalog entries, application commands/queries, persisted scheduled-task/run state,
scheduler process manager, runtime adapter execution path, task-run logs, entrypoints, or public
docs are active yet.
