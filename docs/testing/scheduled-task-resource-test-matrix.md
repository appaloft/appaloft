# Scheduled Task Resource Test Matrix

## Scope

This matrix covers Resource-owned scheduled task definitions, run attempts, run history, and logs.
Some entrypoints remain migration gaps until the full CLI/Web/docs surface is active.

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
| SCHED-TASK-DOMAIN-003 | Core domain | Scheduled task run attempt state machine. | Run attempts start accepted, can start runtime execution, can finish as succeeded/failed/skipped, preserve Resource/task ownership without a Deployment id, and reject invalid transitions or unsafe failure summaries. |
| SCHED-TASK-APP-001 | Application message model | Scheduled task command/query messages. | Target scheduled-task and scheduled-task-run command/query schemas parse explicit operation inputs and align with active operation catalog entries. |
| SCHED-TASK-CREATE-001 | Application command | User creates a scheduled task. | Command validates core scheduled-task fields, stores a Resource-owned task definition through the repository port, and returns a safe task summary. |
| SCHED-TASK-CREATE-002 | Application command | Resource is archived. | Create admission rejects before storing a task with a structured Resource lifecycle phase. |
| SCHED-TASK-QUERY-001 | Application query | User lists or shows scheduled task definitions. | Query handlers wrap the scheduled-task read model with stable schema versions and generated timestamps. |
| SCHED-TASK-QUERY-002 | Application query | User shows a missing scheduled task. | Show query returns a structured `not_found` error with scheduled-task read phase details. |
| SCHED-TASK-UPDATE-001 | Application command | User configures a scheduled task. | Command validates patched core scheduled-task fields, stores the Resource-owned task definition through the repository port, and returns a safe task summary. |
| SCHED-TASK-UPDATE-002 | Application command | Resource is archived. | Update admission rejects before storing changes with a structured Resource lifecycle phase. |
| SCHED-TASK-DELETE-001 | Application command | User deletes a scheduled task. | Command verifies Resource ownership and deletes through an explicit repository mutation spec with a timestamped result. |
| SCHED-TASK-DELETE-002 | Application command | Resource context does not match task ownership. | Delete admission rejects before persistence with a structured Resource context mismatch phase. |
| SCHED-TASK-RUN-001 | Application command | User runs a task now. | Command returns `ok({ runId })` after admission; run state starts as accepted/pending/running according to workflow. |
| SCHED-TASK-RUN-002 | Application command | Resource is archived. | Run admission rejects or skips before runtime execution with a structured resource lifecycle phase. |
| SCHED-TASK-RUN-QUERY-001 | Application query/log adapter | User lists or shows task runs or reads run logs. | Query handlers wrap run-specific read models with stable schema versions and generated timestamps while deployment/resource runtime logs remain unchanged. |
| SCHED-TASK-PERSIST-001 | Persistence/read model | Task definition is stored and queried. | Postgres/PGlite repository rehydrates the Resource-owned task aggregate and read model lists/shows task definitions by Resource/project/environment/status filters. |
| SCHED-TASK-PERSIST-002 | Persistence mutation | Task definition is deleted. | Postgres/PGlite repository delete mutation removes the Resource-owned definition from show/list read models without touching deployment history. |
| SCHED-TASK-PERSIST-003 | Persistence/read model | Run attempt is stored and queried. | Postgres/PGlite repository persists accepted/running/terminal run state, run read models list/show by task/Resource/status/trigger filters, and task read models expose the latest run summary. |
| SCHED-TASK-SCHED-001 | Scheduler | Enabled task is due. | Scheduler dispatches the same run admission path as run-now and records the same run shape. |
| SCHED-TASK-SCHED-002 | Scheduler/concurrency | Previous run is non-terminal. | Default `forbid` policy prevents concurrent runtime execution and records safe skip/rejection state. |
| SCHED-TASK-RUNTIME-001 | Runtime adapter | Accepted task run is executed. | Runtime adapter executes one-off task command intent and returns run-scoped stdout/stderr logs, terminal status, timestamps, and exit code without writing deployment/resource runtime logs. |
| SCHED-TASK-WORKER-001 | Application worker | Accepted run is drained. | Worker transitions accepted run to running, invokes the scheduled-task runtime port, records run-scoped logs, and persists terminal run state. |
| SCHED-TASK-RUNNER-001 | Shell runner | Scheduled task runner is enabled. | Long-running shell composition can start an opt-in scheduled task runner that scans due tasks, admits scheduled runs, and drains the admitted runs through the worker. |
| SCHED-TASK-LOGS-001 | Query/log adapter | Run emits output. | `scheduled-task-runs.logs` reads run-scoped logs; deployment and resource runtime logs are unchanged. |
| SCHED-TASK-SECRET-001 | Redaction | Task input references secrets. | Definitions, runs, logs, errors, diagnostics, and tool descriptors expose only safe references and masked values. |
| SCHED-TASK-ENTRY-001 | CLI/API/Web/MCP | Entrypoints are active. | CLI and HTTP/oRPC dispatch command/query messages through the catalog schemas; generated MCP descriptors consume the catalog entries; Web controls remain a migration gap until implemented. |

## Current Implementation Notes And Migration Gaps

`SCHED-TASK-CATALOG-001` has active-catalog coverage and `SCHED-TASK-APP-001` has command/query
message-shape coverage in `packages/application/test/scheduled-tasks-application-model.test.ts`.
HTTP/oRPC entrypoint coverage for `SCHED-TASK-ENTRY-001` lives in
`packages/orpc/test/scheduled-task.http.test.ts`; CLI coverage lives in
`packages/adapters/cli/test/scheduled-task-command.test.ts`.
`SCHED-TASK-CREATE-001`, `SCHED-TASK-CREATE-002`, and unsafe command-intent coverage for
`SCHED-TASK-SECRET-001` have application create-admission coverage in
`packages/application/test/scheduled-task-create.test.ts`.
`SCHED-TASK-QUERY-001`, `SCHED-TASK-QUERY-002`, and `SCHED-TASK-RUN-QUERY-001` have application
read-query coverage in `packages/application/test/scheduled-task-read-queries.test.ts`.
`SCHED-TASK-UPDATE-001`, `SCHED-TASK-UPDATE-002`, and unsafe command-intent coverage for
`SCHED-TASK-SECRET-001` have application update-admission coverage in
`packages/application/test/scheduled-task-update.test.ts`.
`SCHED-TASK-DELETE-001` and `SCHED-TASK-DELETE-002` have application delete-admission
coverage in `packages/application/test/scheduled-task-delete.test.ts`.
`SCHED-TASK-RUN-001` and `SCHED-TASK-RUN-002` have application run-now admission coverage
in `packages/application/test/scheduled-task-run-now.test.ts`.
`SCHED-TASK-SCHED-001` has application scheduler admission coverage in
`packages/application/test/scheduled-task-scheduler.test.ts` and Postgres/PGlite due-candidate
read-model coverage in `packages/persistence/pg/test/scheduled-task-definition.pglite.test.ts`.
`SCHED-TASK-RUNTIME-001` and one runtime-output masking path for `SCHED-TASK-SECRET-001` have
adapter coverage in `packages/adapters/runtime/test/scheduled-task-runtime.test.ts`.
`SCHED-TASK-WORKER-001` has application worker coverage in
`packages/application/test/scheduled-task-run-worker.test.ts`.
`SCHED-TASK-RUNNER-001` has shell runner and configuration coverage in
`apps/shell/test/scheduled-task-runner.test.ts` and `packages/config/test/index.test.ts`.
`SCHED-TASK-DOMAIN-001` through `SCHED-TASK-DOMAIN-003` have core coverage in
`packages/core/test/scheduled-task.test.ts`. The implemented slices add dedicated value objects for
schedule, timezone, command intent, timeout, retry, lifecycle status, and `forbid` concurrency
policy plus a Resource-owned scheduled task definition state with no deployment id. They also add
the core scheduled-task run attempt lifecycle for accepted, running, succeeded, failed, and skipped
states with safe terminal details and no Deployment id.
`SCHED-TASK-PERSIST-001` through `SCHED-TASK-PERSIST-003` and `SCHED-TASK-LOGS-001` have PGlite
coverage in `packages/persistence/pg/test/scheduled-task-definition.pglite.test.ts`. The run-log
coverage also exercises one log masking path for `SCHED-TASK-SECRET-001`, while the full secret
matrix remains open for definitions, runs, errors, diagnostics, and tool descriptors.

Inactive application command/query schemas, messages, result DTOs, read-model ports, create,
update, delete, run-now admission, scheduler admission, accepted-run worker, read-query
handlers/services, scheduled task persistence/read models, and hermetic runtime adapter support
exist. Shell composition can resolve the scheduled-task repositories, read models, runtime port,
handlers, use cases, scheduler, and worker. The scheduled-task runner is configured off by default
and can be enabled for long-running shell processes. Operation catalog entries, HTTP/oRPC routes,
CLI commands, and generated MCP descriptors are active; Web controls and public docs remain open.
