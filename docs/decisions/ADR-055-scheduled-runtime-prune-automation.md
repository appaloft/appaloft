# ADR-055: Scheduled Runtime Prune Automation

Status: Accepted

Date: 2026-05-12

## Context

ADR-047 and ADR-050 define manual `servers.capacity.prune` as a dry-run-first runtime target
maintenance command. Phase 9 still needs scheduled runtime prune automation and broader retention
policy integration before hosted and self-hosted operators can rely on predictable cleanup instead
of manual one-off commands.

Scheduling runtime prune is higher risk than manual preview because it may delete target-local
artifacts without an operator watching the command. The automation must therefore reuse the manual
command boundary, keep destructive mode policy-gated, preserve rollback and active-runtime safety,
and expose skipped/deleted diagnostics through operator-visible state.

## Decision

Appaloft will model scheduled runtime prune automation as an internal runtime target maintenance
workflow that dispatches the existing `servers.capacity.prune` command through the command bus.

The workflow must:

- select eligible deployment targets from an explicit retention policy source;
- compute the cutoff from policy duration and the scheduler tick time;
- default each scheduled run to dry-run unless the policy explicitly enables destructive prune for
  the selected target scope;
- reuse `PruneServerCapacityCommandInput` and never introduce a transport-only prune input shape;
- preserve ADR-047 and ADR-050 safety boundaries, including active runtime preservation, rollback
  candidate retention, no Docker volume prune, no Appaloft state-root deletion, and explicit
  Docker build-cache or unused-image category opt-in;
- record accepted scheduled work as durable process attempts before worker execution;
- expose due, claimed, skipped, failed, retry-scheduled, dead-lettered, and pruned results through
  `operator-work.*`;
- record the same aggregate-scoped audit row as manual destructive prune when candidates are
  actually deleted;
- keep runtime target adapter deletion behind the existing application command/use-case boundary.

Retention policy source precedence follows the existing environment precedence model:

`defaults < system < organization < project < environment < deployment snapshot`

The first Code Round may implement only defaults/system/organization/project/environment policy
resolution if deployment-snapshot retention policy is not yet persisted, but the omission must be
recorded as a migration gap rather than changing the precedence contract.

## Consequences

- There is no separate public scheduled prune command in the first automation slice. Operators use
  existing policy configuration surfaces when they exist, `operator-work.*` for visibility and
  repair, and `servers.capacity.prune` for manual preview or one-off execution.
- Scheduled prune workers must not call runtime adapters or repositories directly from shell code.
  Shell composition may run a scheduler loop, but execution flows through command/query buses and
  injected application ports.
- Destructive scheduled prune remains disabled until a governed retention policy explicitly enables
  it for a target scope and categories.
- Automation failures are post-acceptance async failures and must be represented as durable process
  state, not hidden in logs.
- Broader retention features such as legal holds, immutable archives, global audit/event export,
  domain event stream retention, and outbox/inbox retention remain separate audit/event slices.

## Governed Specs

- [Scheduled Runtime Prune Automation](../specs/061-scheduled-runtime-prune-automation/spec.md)
- [Runtime Target Capacity Test Matrix](../testing/runtime-target-capacity-test-matrix.md)
- [Runtime Artifact And Workspace Prune](../specs/055-runtime-artifact-workspace-prune/spec.md)
- [servers.capacity.prune Command Spec](../commands/servers.capacity.prune.md)
- [Durable Process Delivery Baseline](../specs/060-durable-process-delivery-baseline/spec.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [Adapter Command/Query Boundary](../architecture/adapter-command-query-boundary.md)
- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)

## Migration Gaps

- The manual `servers.capacity.prune` command is implemented. Scheduled runtime prune now has a
  disabled-by-default shell runner, policy reader, durable worker handoff, CLI/HTTP policy
  configure/list/show entrypoints, and repository config `retention.runtimePrune` materialization
  into a `deployment-snapshot` scoped policy for the selected target.
- The current runtime prune command has aggregate-scoped audit output for destructive deletions;
  scheduled prune must reuse it when deletion happens, but it does not add domain event stream or
  outbox publication in the first slice.
