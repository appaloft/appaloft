# Environment Lifecycle Workflow Spec

## Normative Contract

Environment lifecycle operations manage only the Workspace `Environment` aggregate identity,
configuration, and lifecycle. They do not own resource lifecycle, deployment execution, runtime
cleanup, access routing, certificates, logs, or audit retention.

The active environment lifecycle operations are:

- `environments.show`
- `environments.list`
- `environments.set-variable`
- `environments.unset-variable`
- `environments.effective-precedence`
- `environments.diff`
- `environments.clone`
- `environments.promote`
- `environments.lock`
- `environments.unlock`
- `environments.archive`

Generic `environments.update` remains forbidden by ADR-026.

## Governing Sources

- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-026: Aggregate Mutation Command Boundary](../decisions/ADR-026-aggregate-mutation-command-boundary.md)
- [ADR-032: Environment Lock Lifecycle](../decisions/ADR-032-environment-lock-lifecycle.md)
- [environments.clone Command Spec](../commands/environments.clone.md)
- [environments.lock Command Spec](../commands/environments.lock.md)
- [environments.unlock Command Spec](../commands/environments.unlock.md)
- [environments.archive Command Spec](../commands/environments.archive.md)
- [environment-locked Event Spec](../events/environment-locked.md)
- [environment-unlocked Event Spec](../events/environment-unlocked.md)
- [environment-archived Event Spec](../events/environment-archived.md)
- [Environment Lifecycle Error Spec](../errors/environments.lifecycle.md)
- [Environment Lifecycle Test Matrix](../testing/environment-lifecycle-test-matrix.md)

## Lifecycle States

Environment lifecycle status is value-object backed.

| Status | Meaning | Allowed public mutations |
| --- | --- | --- |
| `active` | Environment can accept configuration writes, clone, promotion, resource creation, and deployment admission. | `environments.set-variable`, `environments.unset-variable`, `environments.clone`, `environments.promote`, `environments.lock`, `environments.archive`, child operations where their specs allow. |
| `locked` | Environment identity, variables, resources, deployments, and history are retained and readable, but new mutations/admission are blocked until unlock. | Read queries, `environments.unlock`, and `environments.archive`. |
| `archived` | Environment identity, variables, resources, deployments, and history are retained, but new mutations/admission are blocked. | Read queries only, plus future explicit restore/delete if specified. |

Environment hard delete, restore, and history are future behaviors and require separate specs.

## Workflow Rules

`environments.show` and `environments.list` read environment identity, lifecycle metadata, and masked
variables.

`environments.set-variable` and `environments.unset-variable` change only environment-owned
configuration entries. They must reject locked or archived environments.

`environments.effective-precedence` and `environments.diff` are read-only and may operate on archived
environments.

`environments.clone` creates a new active environment in the same project from an active source
environment's current environment-owned variables. It must reject archived source environments,
locked source environments, archived source projects, and duplicate target names. It does not copy
resources, deployments, domains, certificates, source links, runtime state, logs, or audit state.

`environments.promote` creates a new active environment from an active source environment. It must
reject locked or archived source environments.

`environments.lock` transitions an active environment to locked. It is idempotent for already locked
environments and preserves original lock metadata. It must reject archived environments.

`environments.unlock` transitions a locked environment back to active. It is idempotent for already
active environments. It must reject archived environments.

`environments.archive` transitions an active or locked environment to archived. It is idempotent for
already archived environments. Archiving a locked environment clears lock metadata and keeps archive
metadata as the visible terminal lifecycle state. It must not cascade archive or delete resources,
deployments, domain bindings, certificates, logs, source links, runtime state, or audit state.

Archived environment guards apply to operations that would create new environment-scoped work:

- `resources.create`
- `deployments.create`

Existing child read operations may remain visible so operators can inspect history and copy support
context.

## Entrypoint Surface Decisions

| Surface | Decision |
| --- | --- |
| CLI | Expose `env clone`, `env lock`, `env unlock`, and `env archive`; do not expose generic `env update`. |
| HTTP/oRPC | Expose clone, lock, unlock, and archive routes that reuse application command schemas. |
| Web | Project detail environment list can clone active environments, lock active environments, unlock locked environments, archive active or locked environments after confirmation, and keep locked/archived environments visible. |
| Repository config | Not applicable. Repository config may select/create environments through deployment bootstrap but must not lock, unlock, or archive them. |
| Future MCP/tools | Generate the tool from the operation catalog entry. |
| Public docs | Stable environment lifecycle anchor describes clone, lock/unlock, archive, and lifecycle guard behavior. |

## Current Implementation Notes And Migration Gaps

No migration gaps are recorded for this lifecycle slice.

## Open Questions

- None for clone, lock/unlock, and archive. History, delete/restore, and cleanup remain separate
  behaviors.
