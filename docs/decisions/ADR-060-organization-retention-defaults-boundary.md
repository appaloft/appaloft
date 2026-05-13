# ADR-060: Organization Retention Defaults Boundary

Status: Accepted

Date: 2026-05-12

## Context

Phase 9 has separate dry-run-first retention commands for audit rows, provider job logs, deployment
logs, resource runtime log archives, and retained domain event stream rows. Those commands require
explicit cutoffs and scopes. Phase 9 still needs a governed boundary for organization-level
retention defaults before scheduled audit/event retention automation can safely compute cutoffs or
decide destructive behavior.

Retention defaults are policy. They are not retained history, legal holds, immutable archives,
event streams, process attempts, runtime artifacts, or scheduler work. They must not silently delete
data, override legal holds, or make existing prune commands destructive by default.

## Decision

Appaloft introduces organization retention defaults as an operator/internal-state policy boundary.

The first policy surface is `retention-defaults.configure`, `retention-defaults.list`, and
`retention-defaults.show`. These operations govern safe default retention windows and destructive
permission for retention categories. They do not execute retention work.

Policy categories are separate from storage tables:

- audit rows;
- domain event streams;
- provider job logs;
- deployment logs;
- resource runtime log archives;
- process attempts.

Each category may define:

- retention days;
- destructive scheduling enabled or disabled;
- dry-run scheduling enabled or disabled;
- scope qualifiers when a later implementation supports them;
- updated metadata for operator visibility.

Organization defaults must follow the same precedence language as other Appaloft configuration:
`defaults < system < organization < project < environment < deployment snapshot`. The first Code
Round may implement only organization scope if lower or higher scopes are not yet modeled, but the
policy shape must not contradict that precedence.

Retention defaults must be consumed only by governed retention automation. Manual prune commands
continue requiring explicit input. Legal holds, immutable archives, replay guards, recovery
readiness, rollback-candidate evidence, active process attempts, and command-specific retention
safety rules continue to win over defaults.

## Consequences

- Organization retention defaults become the policy source that later scheduled audit/event
  retention automation can read to compute category cutoffs.
- Existing manual prune commands remain explicit and dry-run-first.
- `audit-events.prune`, `domain-events.prune`, provider/deployment/runtime-log prune operations,
  and `operator-work.prune` must not invent local default retention semantics.
- Web may remain a future operator maintenance surface; CLI and HTTP/oRPC are the first governed
  policy entrypoints when Code Round starts.
- Persistence implementation must live behind application ports and `packages/persistence/pg`;
  adapters must dispatch command/query messages through buses.

## Governed Specs

- [Organization Retention Defaults](../specs/066-organization-retention-defaults/spec.md)
- [Organization Retention Defaults Test Matrix](../testing/organization-retention-defaults-test-matrix.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [Adapter Command/Query Boundary](../architecture/adapter-command-query-boundary.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Migration Gaps

- Code Round still needs command/query specs, schemas, handlers, use cases/query services,
  persistence, CLI and HTTP/oRPC entrypoints, operation catalog entries, public docs/help coverage,
  and tests.
- Scheduled retention automation remains a separate governed slice and must not run destructive
  work merely because defaults exist.
- Organization defaults do not replace legal holds, immutable archives, or category-specific
  retention guards.
