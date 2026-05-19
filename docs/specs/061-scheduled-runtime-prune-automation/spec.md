# Scheduled Runtime Prune Automation

## Status

- Round: Code Round / Post-Implementation Sync
- Artifact state: active baseline; policy command/query surfaces, persistence-backed discovery,
  disabled-by-default runner wiring, durable process visibility, audit reuse, repository config
  materialization, and maintenance-worker status readback are implemented. Web policy editing is an
  optional future affordance, not a blocker for the scheduled prune execution boundary.

## Business Outcome

Operators can enable predictable runtime target cleanup from explicit retention policy while keeping
the same safety, dry-run, audit, and operator-work visibility guarantees as manual
`servers.capacity.prune`.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Scheduled runtime prune | Internal maintenance workflow that periodically evaluates runtime target prune policy and dispatches `servers.capacity.prune`. | DeploymentTarget runtime observation | scheduled cleanup |
| Runtime prune policy | Retention configuration that selects target scope, categories, cutoff duration, dry-run/destructive mode, and schedule. | Retention policy | cleanup policy |
| Prune automation run | One durable scheduled execution attempt for one deployment target and policy version. | Operator/Internal State | maintenance run |
| Policy-gated destructive prune | Destructive prune allowed only when retention policy explicitly enables it for the target scope and categories. | Runtime target maintenance | automatic delete |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| RT-CAP-SCHED-001 | Policy selection uses precedence | multiple policy scopes define runtime prune retention | the scheduler evaluates a target | the chosen policy follows `defaults < system < organization < project < environment < deployment snapshot`, with masked/safe policy readback. |
| RT-CAP-SCHED-002 | Scheduled prune defaults to dry-run | a policy omits destructive enablement | a due schedule ticks | Appaloft dispatches `servers.capacity.prune` with `dryRun = true`, records durable process visibility, and deletes nothing. |
| RT-CAP-SCHED-003 | Destructive automation is policy-gated | a policy explicitly enables destructive prune for selected categories | the scheduled worker runs | only the existing `servers.capacity.prune` command may delete candidates, preserving ADR-047/ADR-050 safety exclusions. |
| RT-CAP-SCHED-004 | Accepted scheduled work is durable | the scheduler accepts a due target prune run | before runtime adapter work begins | a durable process attempt exists with operation key, target id, policy scope/version, category set, cutoff, request/correlation ids, and safe details. |
| RT-CAP-SCHED-005 | Retry and dead-letter visibility | a scheduled prune worker fails after acceptance | retry policy allows or rejects retry | operator work shows failed, retry-scheduled, canceled, recovered, or dead-lettered state without raw runtime output or secrets. |
| RT-CAP-SCHED-006 | Audit output matches manual prune | destructive scheduled prune deletes candidates | command completes | Appaloft records the same aggregate-scoped audit row shape as manual destructive prune, with safe counts/categories only. |
| RT-CAP-SCHED-007 | Entrypoints remain CQRS-thin | shell scheduler, HTTP, CLI, or future tools interact with scheduled prune | work is selected or observed | scheduler code dispatches commands/queries through buses and never calls runtime adapters, repositories, or prune use cases directly. |
| RT-CAP-SCHED-008 | Preview-oriented categories are explicit | a scheduled policy is intended for preview-oriented target cleanup | the policy is configured and dispatched | the policy may explicitly include stopped containers, preview/source workspaces, Docker cache, unused images, and remote-state markers; remote-state markers remain out of default categories and require explicit policy selection. |

## Domain Ownership

- Bounded context: Deployment Target / runtime target observation, with Operator/Internal State for
  durable process visibility.
- Aggregate/resource owner: `DeploymentTarget` supplies target identity and scope. Runtime target
  adapters own target-specific evidence and deletion only behind `servers.capacity.prune`.
- Upstream/downstream contexts: retention policy configuration supplies policy; audit event read
  model records destructive prune audit rows; operator work exposes process state.

## Public Surfaces

- API/CLI: no new scheduled prune execution command in the first implementation slice. Manual
  preview and one-off execution continue through `servers.capacity.prune`. Policy command/query
  application surfaces are `scheduled-runtime-prune-policies.configure`,
  `scheduled-runtime-prune-policies.list`, and `scheduled-runtime-prune-policies.show`; CLI and
  HTTP/oRPC adapters expose those surfaces through command/query bus dispatch and shared schemas.
- Operator visibility: `operator-work.list/show/retry/cancel/dead-letter/mark-recovered/prune`
  cover accepted scheduled prune process attempts.
- Web/UI: Instance diagnostics expose configured maintenance-worker status, including whether the
  scheduled runtime prune runner is enabled. A future Web policy editor may use the same policy and
  operator-work surfaces, but policy editing is already available through CLI and HTTP/oRPC.
- Config: runtime prune policy configuration through the application command surface is required
  before destructive scheduled prune can be enabled. Repository config may also carry a
  `retention.runtimePrune` profile. During deployment config bootstrap, Appaloft materializes that
  profile into a `deployment-snapshot` scoped scheduled runtime prune policy for the selected target
  after target resolution and before deployment admission. The materialized policy uses the
  existing scheduled policy repository shape and remains safe readback only.
- Events/audit: destructive scheduled prune records the same retained audit row as manual prune
  when candidates are deleted; no domain event stream/outbox publication is added in this slice.
- Public docs/help: manual prune uses `diagnostics.runtime-target-capacity`; policy
  configure/list/show use `diagnostics.scheduled-runtime-prune-policy`.

## Non-Goals

- Docker volume prune or broad `docker system prune`.
- Appaloft state-root, live remote-state, audit/event, log, route, deployment snapshot, resource,
  server, dependency, or storage-volume retention. Bounded cleanup of old remote-state marker
  archives is limited to explicit `remote-state-markers` selection and SSH PGlite sync backup
  recovery-window retention.
- Legal holds, immutable archives, global audit/event export, organization-wide audit defaults, or
  domain event stream retention.
- A generic retention scheduler for every Appaloft retention boundary in the first slice.

## Current Implementation Notes And Governed Follow-Ups

- Manual `servers.capacity.prune` is implemented with dry-run default, destructive opt-in, adapter
  safety exclusions, Docker build-cache/unused-image category opt-in, CLI/oRPC entrypoints, and
  destructive audit output.
- Scheduled runtime prune now has a first application service slice for already-resolved policy
  input. The application resolver selects the highest-precedence already-loaded policy with safe
  readback. The runner service records a durable process attempt, claims it, dispatches
  `PruneServerCapacityCommand` through a bus-like command boundary, completes succeeded work, and
  records retry-scheduled process state on command failure. Destructive scheduled runs at the
  application service boundary reuse the same aggregate-scoped audit row path as manual
  `servers.capacity.prune`. A shell runner module can dispatch explicitly supplied policies through
  the application service without calling runtime adapters directly. Operator-work dead-letter and
  mark-recovered application paths preserve scheduled prune safe details as process state only.
  Shell composition has disabled-by-default runner lifecycle wiring and discovers enabled persisted
  policies through the injected scheduled runtime prune policy read model. Persistence-backed
  policy-to-worker handoff now records and completes safe durable process attempts through the
  process-attempt journal.
- Code Round has application command/query surfaces, CLI and HTTP/oRPC entrypoints, public
  docs/help anchor coverage, persistence-backed `deployment-snapshot` scope readback for policy
  configuration, and repository config materialization from `retention.runtimePrune` during
  deployment config bootstrap. The first materialization slice is target-scoped and does not create
  organization defaults, audit/event retention policy, or a generic retention scheduler.
