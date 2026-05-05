# ADR-039: Scheduled Task Resource Ownership

## Status

Accepted

## Decision

Scheduled tasks are Resource-owned workload automation. They are not Deployment attempts, not
server-owned cron entries, and not generic background jobs.

A scheduled task belongs to one Resource and stores reusable trigger and command intent:

- display name;
- enabled/disabled lifecycle state;
- schedule expression and timezone;
- task command or named runtime command reference;
- concurrency policy;
- timeout and retry policy;
- safe environment/config reference policy.

Each execution creates a scheduled task run attempt with its own id, status, timestamps, exit
summary, failure details, and logs. Run attempts are read and observed through scheduled-task run
queries, not through `deployments.show`, `deployments.logs`, or `resources.runtime-logs`.

Scheduled task execution consumes the same Resource profile, environment snapshot, dependency
binding snapshot references, and Docker/OCI workload substrate as deployments, but it does not
create a Deployment attempt and does not replace or restart the current serving Resource runtime.

## Context

The roadmap needs cron-like workload support for recurring jobs, manual "run now", history, and
logs. Existing Appaloft semantics already separate:

- Resource-owned reusable profile state from Deployment snapshots;
- Deployment attempts from runtime controls;
- read-only operator work visibility from recovery mutations;
- Docker/OCI workload planning from runtime target execution.

Without an explicit ownership rule, scheduled tasks could drift into several wrong surfaces:

- ad hoc server cron state hidden outside Appaloft;
- generic job rows without Resource profile/version context;
- Deployment attempts that confuse release history with recurring task runs;
- one-off runtime controls that mutate the serving workload.

## Chosen Rule

The first public scheduled-task surface must be an explicit Resource child lifecycle:

- `scheduled-tasks.create`;
- `scheduled-tasks.list`;
- `scheduled-tasks.show`;
- `scheduled-tasks.update`;
- `scheduled-tasks.delete`;
- `scheduled-tasks.run-now`;
- `scheduled-task-runs.list`;
- `scheduled-task-runs.show`;
- `scheduled-task-runs.logs`.

Those operation names are target names for the Code Round. They must be added to
`docs/CORE_OPERATIONS.md` and `packages/application/src/operation-catalog.ts` only when activated.

`scheduled-tasks.run-now` and scheduler-fired runs are both run-admission paths. Command success
means the run attempt was accepted and assigned an id; it does not mean the task command completed.

The scheduler is an internal process manager. It scans enabled scheduled tasks, applies schedule and
concurrency policy, and dispatches run admission. It must not bypass the same use case that
`scheduled-tasks.run-now` uses.

Default v1 concurrency policy is `forbid`: if a previous run for the same task is non-terminal, the
next due fire is skipped or recorded as skipped according to the run-history spec. Future `allow`
or `replace` policies require explicit test rows before activation.

Scheduled task execution must use operation coordination scope kind `resource-runtime` until a
separate `scheduled-task-run` scope is accepted. The logical key must include Resource, runtime
target placement, and scheduled task id so task runs do not silently collide with unrelated
Resources. The first implementation may choose to serialize scheduled task runs with deployments
for the same Resource/target when the runtime backend cannot prove isolated one-off execution.

## Boundaries

Scheduled tasks must not:

- add schedule, task command, or retry fields to `deployments.create`;
- appear as Deployment attempts in deployment history;
- restart, stop, or replace the serving Resource runtime;
- write raw secret values into task definitions, run history, logs, errors, diagnostics, or MCP/tool
  descriptors;
- depend on server-local cron as the source of truth;
- expose provider SDK or Docker-native object types in core/application contracts.

Scheduled task logs are task-run logs. Resource runtime logs remain the current serving workload's
logs. Deployment logs remain deployment-attempt logs.

## Governed Specs

- [Scheduled Task Resource Shape](../specs/044-scheduled-task-resource-shape/spec.md)
- [Scheduled Task Resource Shape Test Matrix](../testing/scheduled-task-resource-test-matrix.md)
- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](./ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-021: Docker/OCI Workload Substrate](./ADR-021-docker-oci-workload-substrate.md)
- [ADR-023: Runtime Orchestration Target Boundary](./ADR-023-runtime-orchestration-target-boundary.md)
- [ADR-028: Command Coordination Scope And Mutation Admission](./ADR-028-command-coordination-scope-and-mutation-admission.md)
- [ADR-029: Deployment Event Stream And Recovery Boundary](./ADR-029-deployment-event-stream-and-recovery-boundary.md)

## Current Implementation Notes And Migration Gaps

No scheduled-task aggregate, repository, operation catalog entry, CLI command, HTTP route, Web
surface, scheduler process manager, or runtime backend execution path is active yet.

The first Code Round must define the persisted state shape, run-attempt state machine, query models,
runtime target execution port, and log reader boundary before exposing public entrypoints.

## Open Questions

- Should skipped due fires be persisted as run attempts or summarized counters?
- Which cron expression subset and timezone validation library should be accepted first?
- Should the first runtime backend run scheduled tasks from latest successful deployment artifact,
  current Resource profile rebuild, or a task-specific artifact snapshot?
