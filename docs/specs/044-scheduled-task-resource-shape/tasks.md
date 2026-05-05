# Tasks: Scheduled Task Resource Shape

## Spec Round

- [x] Add ADR-039 for scheduled task ownership and boundaries.
- [x] Position scheduled tasks in the business operation map as accepted candidates.
- [x] Create local spec, plan, and task artifacts.
- [x] Create the scheduled task resource test matrix.
- [x] Update roadmap notes without marking implementation complete.

## Test-First

- [ ] `SCHED-TASK-CATALOG-001`: operation catalog entries appear only when activated.
- [x] `SCHED-TASK-DOMAIN-001`: task definition value objects validate schedule, timezone, command
  intent, timeout, retry, status, and concurrency policy.
- [x] `SCHED-TASK-DOMAIN-002`: invalid schedule or unsafe command intent returns structured
  validation errors without primitive domain state.
- [x] `SCHED-TASK-DOMAIN-003`: run attempt state starts accepted, transitions to running and
  terminal succeeded/failed/skipped states, and rejects invalid transitions or unsafe failure
  summaries.
- [x] `SCHED-TASK-APP-001`: inactive application command/query messages parse target
  scheduled-task inputs without activating operation catalog entries.
- [x] `SCHED-TASK-CREATE-001`: create accepts a Resource-owned task definition without activating
  operation catalog entries.
- [x] `SCHED-TASK-CREATE-002`: Resource archive blocks task creation before persistence.
- [x] `SCHED-TASK-QUERY-001`: task list/show queries wrap scheduled-task read models without
  activating operation catalog entries.
- [x] `SCHED-TASK-QUERY-002`: missing task show query returns structured not-found details.
- [x] `SCHED-TASK-RUN-001`: run-now accepts a run attempt without completing it synchronously.
- [x] `SCHED-TASK-RUN-002`: Resource archive blocks run-now before runtime execution.
- [x] `SCHED-TASK-RUN-QUERY-001`: run list/show/log queries wrap run-specific read models.
- [ ] `SCHED-TASK-SCHED-001`: scheduler dispatches through the same run admission use case.
- [ ] `SCHED-TASK-LOGS-001`: task-run logs are separate from deployment/resource runtime logs.
- [ ] `SCHED-TASK-SECRET-001`: task definitions, runs, logs, and errors mask secrets.

## Implementation

- [x] Add core scheduled-task definition value objects and Resource-owned state shape.
- [x] Add core scheduled-task run attempt state machine.
- [x] Add inactive application scheduled-task command/query schemas, messages, and read-model
  ports.
- [x] Add inactive application create task admission handler/use case.
- [x] Add inactive application run-now admission handler/use case.
- [x] Add inactive application read-query handlers/services for task and run history surfaces.
- [ ] Add remaining application scheduled-task handlers/use cases.
- [ ] Add persistence/read models.
- [ ] Add scheduler process manager.
- [ ] Add runtime adapter one-off task execution/log support.
- [ ] Add CLI/API/Web/MCP surfaces.

## Docs Round

- [ ] Add public docs page/help anchor.
- [ ] Add CLI/API descriptions and Web help links.

## Verification

- [ ] Run targeted domain/application/persistence/adapter/Web tests.
- [ ] Run `bun run lint`.
- [ ] Run `bun turbo run typecheck`.
