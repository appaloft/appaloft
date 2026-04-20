# ADR-026: Aggregate Mutation Command Boundary

## Status

Accepted

## Decision

Appaloft forbids generic aggregate-root update operations in the public business surface.

No aggregate root may expose a command whose operation key, message, route, CLI command, or future
MCP tool is a generic mutation such as:

- `{aggregate}.update`
- `{aggregate}.patch`
- `{aggregate}.save`
- `{aggregate}.edit`
- `Update{Aggregate}Command`
- `Patch{Aggregate}Command`

Every aggregate-root mutation must be modeled as an intention-revealing domain command that names
the invariant, lifecycle transition, or owned sub-profile being changed.

Examples of accepted command naming:

- `projects.rename`
- `projects.archive`
- `servers.configure-credential`
- `servers.bootstrap-proxy`
- `environments.set-variable`
- `environments.unset-variable`
- `environments.promote`
- `resources.configure-source`
- `resources.configure-runtime`
- `resources.configure-network`
- `resources.configure-health`
- `resources.archive`
- `domain-bindings.confirm-ownership`
- `certificates.issue-or-renew`

If a proposed mutation cannot be named without a generic `update`, the domain concept is not yet
clear enough for implementation. The next step must be a Spec Round that splits the mutation into
explicit commands or defines the missing domain concept.

## Context

Appaloft is a deployment platform with explicit aggregate roots and business operations. A generic
update command hides which invariant is changing, which events should be emitted, which lifecycle
guards apply, which entrypoints are allowed, and which tests prove the behavior.

This is especially risky for aggregate roots such as `Resource`, `DeploymentTarget`,
`DomainBinding`, and `Environment`, where changing source, runtime, network, health, credential,
domain ownership, readiness, or lifecycle state has different rules and different downstream
effects.

The command boundary is part of the domain model. "Update" is not a domain operation; it is a
persistence verb.

## Chosen Rule

For every aggregate root listed in [Domain Model](../DOMAIN_MODEL.md), public write behavior must
follow these rules:

1. The command name must describe the domain intent.
2. The command spec must identify the exact aggregate-owned state it may mutate.
3. The command spec must identify state it must not mutate.
4. The command must publish or record events that match the domain intent, not a generic
   `{aggregate}-updated` event.
5. Transport routes, CLI commands, Web actions, automation calls, and future MCP tools must map to
   the same intention-revealing operation key.
6. If one user workflow needs multiple aggregate mutations, it must sequence multiple explicit
   commands or be specified as a workflow. It must not collapse them into one generic update.

`configure-*` is allowed only when the suffix names a domain-owned concept such as credential,
source, runtime, network, health, edge proxy, or policy. `configure-profile` is allowed only if a
future ADR/spec defines "profile" as a cohesive domain value object with one invariant boundary.

## Allowed Technical Uses Of update

This ADR does not ban implementation words inside lower layers when they are not business
operations:

- repository adapter methods may update database rows;
- persistence specs may use `update` or `upsert` as storage mechanics;
- read-model projectors may update projections;
- migrations and data repair scripts may update records;
- documentation may say that a read model or projection is updated by an event.

Those uses must not leak into operation keys, command names, user-facing CLI commands, oRPC/OpenAPI
business routes, Web action names, future MCP tool names, domain events, or aggregate method names.

## Consequences

- Generic `xxx.update` operations are rebuild-required if they exist or are proposed.
- Future operation lists must use exact names such as `rename`, `configure-*`, `set-*`, `unset-*`,
  `bind-*`, `confirm-*`, `archive`, `delete`, `promote`, `rotate`, `issue-or-renew`, or another
  domain verb accepted by a spec.
- Tests must assert that entrypoints do not expose generic aggregate update commands.
- Operation catalog entries must be reviewed for generic update naming before Code Round.
- Web forms that visually edit several fields must dispatch the specific command for each domain
  concern or an accepted workflow that sequences commands.

## Governed Specs

- [Domain Model](../DOMAIN_MODEL.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Spec-Driven Testing Guide](../testing/SPEC_DRIVEN_TESTING.md)
- [Resource Profile Lifecycle Workflow](../workflows/resource-profile-lifecycle.md)
- [Resource Profile Lifecycle Test Matrix](../testing/resource-profile-lifecycle-test-matrix.md)

## Superseded Open Questions

- Whether future resource profile changes should use `resources.update`.
- Whether future aggregate profile changes can be represented by generic update commands.

## Current Implementation Notes And Migration Gaps

Existing repository and persistence code may still use update/upsert terminology internally. That
is allowed when it remains below the business operation boundary.

Future operation specs and implementation plans must be reviewed and renamed when they currently
describe a generic aggregate update.

## Open Questions

None.
