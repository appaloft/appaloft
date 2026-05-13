# ADR-061: Scheduled History Retention Automation

Status: Accepted

Date: 2026-05-12

## Context

Phase 9 has manual, dry-run-first prune commands for retained audit rows, provider job logs,
deployment logs, resource runtime log archives, domain event stream rows, and durable process
attempts. ADR-060 adds non-executing retention defaults so a later worker can compute cutoffs
without hardcoding retention windows into each command.

Scheduled retention is higher risk than manual prune because it may delete operator history while
no operator is watching the command. It must therefore reuse existing command boundaries, preserve
category-specific guard behavior, and expose accepted work and failures through durable process
state.

## Decision

Appaloft will model scheduled history retention automation as an internal Operator/Internal State
workflow that consumes retention default policy and dispatches existing manual prune commands
through the command bus.

The workflow must:

- read enabled retention default policy records and compute a cutoff from `retentionDays` and the
  scheduler tick timestamp;
- default scheduled work to dry-run unless the selected policy explicitly enables destructive
  scheduling for that category;
- dispatch existing command messages such as `audit-events.prune`, `domain-events.prune`,
  `provider-job-logs.prune`, `deployments.logs.prune`,
  `resources.runtime-log-archives.prune`, and `operator-work.prune`;
- never call retention stores, repositories, or prune use cases directly from shell scheduler code;
- record accepted scheduled retention work as durable process attempts before command execution;
- complete process attempts as succeeded, failed, retry-scheduled, dead-lettered, canceled, or
  recovered through the ADR-054 durable process delivery boundary;
- preserve legal holds, immutable archive source-row guards, domain event replay guards, active
  process attempt guards, recovery evidence, rollback-candidate evidence, and every
  category-specific skip rule;
- keep manual prune commands explicit and dry-run-first even when defaults exist;
- expose skipped, candidate, pruned, and failure counts through safe operator-work details.

The first implementation may support a subset of governed categories, but unsupported categories
must be skipped visibly and recorded as migration gaps rather than treated as silently complete.

## Consequences

- There is no new public scheduled retention command in the first automation slice. Operators use
  `retention-defaults.*` to configure policy, existing manual prune commands for one-off
  execution, and `operator-work.*` for visibility and repair.
- Scheduled history retention is separate from scheduled runtime target prune, which remains
  governed by ADR-055 and `servers.capacity.prune`.
- Category guards stay authoritative over defaults and scheduler decisions.
- Implementation must add tests that prove scheduler dispatch goes through command/query
  boundaries and that destructive scheduling cannot bypass category guards.
- Web remains a future operator maintenance surface unless a governed UI slice enters scope.

## Governed Specs

- [Scheduled History Retention Automation](../specs/067-scheduled-history-retention-automation/spec.md)
- [Scheduled History Retention Automation Test Matrix](../testing/scheduled-history-retention-test-matrix.md)
- [Organization Retention Defaults](../specs/066-organization-retention-defaults/spec.md)
- [Durable Process Delivery Baseline](../specs/060-durable-process-delivery-baseline/spec.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [Adapter Command/Query Boundary](../architecture/adapter-command-query-boundary.md)
- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)

## Migration Gaps

- The manual prune commands, organization retention defaults, scheduled history retention
  application service, and disabled-by-default shell runner exist. There is still no public
  scheduled-retention command, HTTP/oRPC route, or Web maintenance surface.
- ADR-054 durable process delivery is the current outbox/inbox-equivalent baseline, so retention for
  accepted background work is represented by durable process attempt retention through
  `operator-work.prune`. A separate outbox/inbox retention command is not applicable unless a future
  ADR introduces a separate outbox/inbox store.
