# ADR-032: Environment Lock Lifecycle

## Status

Accepted

## Decision

Appaloft models environment locking as an explicit `Environment` lifecycle transition, not as a
generic update and not as a deployment-time flag.

The public operation keys are:

- `environments.lock`
- `environments.unlock`

The canonical lifecycle statuses are:

- `active`: environment accepts environment configuration writes, promotion, resource creation, and
  deployment admission.
- `locked`: environment remains readable but rejects environment configuration writes, promotion,
  resource creation, and deployment admission. It can be unlocked or archived.
- `archived`: environment remains readable but rejects new mutation/admission work. Archive is the
  retention lifecycle and can be reached from `active` or `locked`.

`environments.lock` is idempotent for an already locked environment and preserves original lock
metadata. It rejects archived environments with `environment_archived`.

`environments.unlock` is idempotent for an already active environment. It rejects archived
environments with `environment_archived`.

Both commands are synchronous workspace-state operations. They do not stop runtime, cancel
deployments, mutate resources, clean up routes, revoke certificates, or delete logs.

## Context

Phase 4 requires environment lifecycle closure beyond archive. Operators need a reversible freeze
for production or other high-risk environments while still allowing read-only inspection, diffs, and
history. A generic environment update would hide which lifecycle invariant changed and would violate
ADR-026.

Lock is distinct from archive:

- lock is a reversible guard for operational change control;
- archive is a retention lifecycle for retired environments.

## Consequences

- `EnvironmentLifecycleStatusValue` includes `locked`.
- Environment read models include optional `lockedAt` and `lockReason`.
- Environment mutation/admission guards return `environment_locked` for locked environments.
- Local specs, events, error contracts, public docs, CLI, HTTP/oRPC, Web, operation catalog, and
  tests must use the same lifecycle vocabulary.
- Future clone or named edit semantics must respect locked and archived source/target environment
  rules in their own specs.

## Governed Specs

- [Environment Lifecycle Workflow](../workflows/environment-lifecycle.md)
- [environments.lock Command Spec](../commands/environments.lock.md)
- [environments.unlock Command Spec](../commands/environments.unlock.md)
- [environment-locked Event Spec](../events/environment-locked.md)
- [environment-unlocked Event Spec](../events/environment-unlocked.md)
- [Environment Lifecycle Error Spec](../errors/environments.lifecycle.md)
- [Environment Lifecycle Test Matrix](../testing/environment-lifecycle-test-matrix.md)

## Migration Gaps

None for this slice.
