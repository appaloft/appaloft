# Tasks: Scheduled Task Resource Shape

## Spec Round

- [x] Add ADR-039 for scheduled task ownership and boundaries.
- [x] Position scheduled tasks in the business operation map as accepted candidates.
- [x] Create local spec, plan, and task artifacts.
- [x] Create the scheduled task resource test matrix.
- [x] Update roadmap notes without marking implementation complete.

## Test-First

- [x] `SCHED-TASK-CATALOG-001`: operation catalog entries appear when activated.
- [x] `SCHED-TASK-DOMAIN-001`: task definition value objects validate schedule, timezone, command
  intent, timeout, retry, status, and concurrency policy.
- [x] `SCHED-TASK-DOMAIN-002`: invalid schedule or unsafe command intent returns structured
  validation errors without primitive domain state.
- [x] `SCHED-TASK-DOMAIN-003`: run attempt state starts accepted, transitions to running and
  terminal succeeded/failed/skipped states, and rejects invalid transitions or unsafe failure
  summaries.
- [x] `SCHED-TASK-APP-001`: application command/query messages parse target scheduled-task inputs
  and align with active operation catalog entries.
- [x] `SCHED-TASK-CREATE-001`: create accepts a Resource-owned task definition.
- [x] `SCHED-TASK-CREATE-002`: Resource archive blocks task creation before persistence.
- [x] `SCHED-TASK-QUERY-001`: task list/show queries wrap scheduled-task read models.
- [x] `SCHED-TASK-QUERY-002`: missing task show query returns structured not-found details.
- [x] `SCHED-TASK-UPDATE-001`: update patches a Resource-owned task definition.
- [x] `SCHED-TASK-UPDATE-002`: Resource archive blocks task updates before persistence.
- [x] `SCHED-TASK-DELETE-001`: delete removes a Resource-owned task definition.
- [x] `SCHED-TASK-DELETE-002`: Resource context mismatch blocks delete before persistence.
- [x] `SCHED-TASK-RUN-001`: run-now accepts a run attempt without completing it synchronously.
- [x] `SCHED-TASK-RUN-002`: Resource archive blocks run-now before runtime execution.
- [x] `SCHED-TASK-RUN-QUERY-001`: run list/show/log queries wrap run-specific read models.
- [x] `SCHED-TASK-PERSIST-001`: task definition repository/read model persists Resource-owned
  definitions and supports list/show filters.
- [x] `SCHED-TASK-PERSIST-002`: task definition delete mutation removes Resource-owned
  definitions from read models.
- [x] `SCHED-TASK-PERSIST-003`: run-attempt repository/read model persists accepted/running/terminal
  runs and exposes latest run summaries.
- [x] `SCHED-TASK-SCHED-001`: scheduler dispatches through the same run admission use case.
- [x] `SCHED-TASK-RUNTIME-001`: runtime adapter executes one-off task commands and returns
  run-scoped logs/results.
- [x] `SCHED-TASK-WORKER-001`: accepted run worker invokes runtime execution and persists terminal
  run/log state.
- [x] `SCHED-TASK-LOGS-001`: task-run logs are separate from deployment/resource runtime logs.
- [x] `SCHED-TASK-ENTRY-001`: HTTP/oRPC entrypoints dispatch scheduled task command/query messages
  through catalog schemas.
- [x] `SCHED-TASK-SECRET-001`: task definitions, runs, logs, errors, diagnostics, and tool
  descriptors mask secrets.

## Implementation

- [x] Add core scheduled-task definition value objects and Resource-owned state shape.
- [x] Add core scheduled-task run attempt state machine.
- [x] Add application scheduled-task command/query schemas, messages, and read-model ports.
- [x] Add application create task admission handler/use case.
- [x] Add application configure task admission handler/use case.
- [x] Add application delete task admission handler/use case.
- [x] Add application run-now admission handler/use case.
- [x] Add application read-query handlers/services for task and run history surfaces.
- [x] Add remaining application scheduled-task handlers/use cases.
- [x] Add scheduled-task definition persistence repository/read model.
- [x] Add scheduled-task run-attempt persistence repository/read model.
- [x] Add scheduled-task run-log persistence/read model.
- [x] Add persistence/read models.
- [x] Add scheduler process manager.
- [x] Add scheduled-task due-candidate persistence/read model.
- [x] Register scheduled-task shell composition dependencies.
- [x] Add opt-in scheduled-task shell runner.
- [x] Add runtime adapter one-off task execution/log support.
- [x] Add accepted-run worker wiring.
- [x] Add broader scheduled-task secret redaction across definition, run, log, runtime-error, and
  generated tool descriptor boundaries.
- [ ] Add CLI/API/Web/MCP surfaces.
  - [x] Activate operation catalog and HTTP/oRPC surfaces.
  - [x] Add CLI commands.
  - [x] Verify generated MCP descriptors.
  - [ ] Add Web controls.
  - [x] Add public docs/help.

## Docs Round

- [x] Add public docs page/help anchor.
- [x] Add CLI/API descriptions.
- [ ] Add Web help links.

## Verification

- [ ] Run targeted domain/application/persistence/adapter/Web tests.
- [ ] Run `bun run lint`.
- [ ] Run `bun turbo run typecheck`.
