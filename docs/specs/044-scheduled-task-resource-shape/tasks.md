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
- [ ] `SCHED-TASK-RUN-001`: run-now accepts a run attempt without completing it synchronously.
- [ ] `SCHED-TASK-SCHED-001`: scheduler dispatches through the same run admission use case.
- [ ] `SCHED-TASK-LOGS-001`: task-run logs are separate from deployment/resource runtime logs.
- [ ] `SCHED-TASK-SECRET-001`: task definitions, runs, logs, and errors mask secrets.

## Implementation

- [x] Add core scheduled-task definition value objects and Resource-owned state shape.
- [ ] Add application scheduled-task command/query model.
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
