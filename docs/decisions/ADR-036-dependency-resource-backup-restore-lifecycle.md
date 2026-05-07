# ADR-036: Dependency Resource Backup And Restore Lifecycle

## Status

Accepted

## Context

Phase 7 requires a minimum useful dependency-resource loop: provision or import a database, bind it
to a Resource, observe safe metadata, create backup restore points, restore from a selected restore
point, and delete only when retention and relationship rules allow deletion.

Postgres and Redis dependency resources already exist as `ResourceInstance` records. Postgres can
now be realized through a provider capability. Current backup relationship metadata blocks delete,
but it does not own backup attempts, restore points, restore attempts, provider execution, event
semantics, or safe read models.

Backup and restore mutate provider/external data outside the Appaloft control plane, so they need
explicit command boundaries, durable attempt state, safe provider artifact handles, and fail-closed
delete safety.

## Decision

Appaloft will model dependency resource backup and restore as a Dependency Resources lifecycle
slice, not as Deployment retry/rollback, ResourceBinding rotation, or StorageVolume backup.

The first slice introduces a dedicated backup aggregate/process record named
`DependencyResourceBackup`:

- it belongs to one `ResourceInstance`;
- it records one backup attempt and the resulting restore point when ready;
- it may record restore attempts from that restore point;
- it stores only safe provider artifact handles, checksums, sizes, timestamps, retention metadata,
  statuses, attempt ids, and sanitized failure metadata;
- it never stores dump bytes, raw connection strings, passwords, provider credentials, secret
  values, or provider SDK payloads.

Public mutation commands are explicit:

- `dependency-resources.create-backup`
- `dependency-resources.restore-backup`

Public read queries are explicit:

- `dependency-resources.list-backups`
- `dependency-resources.show-backup`

Command success follows the async lifecycle contract. Admission succeeds when the selected
dependency resource, backup or restore attempt, safety acknowledgements, and provider capability
admission are durably recorded. Provider execution success or failure is reflected through durable
attempt state, read models, and lifecycle events.

The first implementation may use a synchronous hermetic provider adapter, but it must preserve the
same durable attempt/status shape required by future background workers.

Restore is in-place to the same dependency resource in the first slice. Cross-resource clone,
point-in-time selection beyond explicit restore points, scheduled backup policy, automatic runtime
restart, deployment redeploy, and stateful rollback are later specs.

## Consequences

- `ResourceInstance` remains the dependency resource aggregate. It owns backup eligibility and delete
  blocker summaries, but restore point history is owned by `DependencyResourceBackup`.
- Delete safety must treat retained ready backup restore points and in-flight backup/restore
  attempts as blockers.
- Restore requires explicit acknowledgement that provider data may be overwritten and that Appaloft
  does not restart or redeploy workloads in this slice.
- Backup and restore provider adapters must sanitize all output before it crosses into application,
  core, events, read models, contracts, CLI, Web, or logs.
- Deployment snapshots remain immutable. Backup/restore does not rewrite historical deployment
  snapshots or binding snapshot references.
- Future Redis provider-native realization can reuse the backup lifecycle without changing command
  boundaries, as long as the provider capability reports support for the dependency kind.

## Non-Goals

- No deployment rollback or redeploy.
- No runtime environment injection or workload restart.
- No provider-native credential rotation.
- No scheduled backup policies.
- No backup data deletion/prune command in the first slice.
- No cross-resource restore, clone, or forked database creation.
- No raw dump export/download surface.

