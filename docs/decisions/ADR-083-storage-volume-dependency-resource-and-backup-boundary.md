# ADR-083: Storage Volume, Dependency Resource, And Backup Boundary

Status: Accepted

Date: 2026-06-09

## Context

Applications such as PocketBase, Vaultwarden, and SQLite-backed workflow tools keep durable
application data in mounted filesystems. A Blueprint may declare this need with a `volume`
requirement, and the installed Resource may later expose a `ResourceStorageAttachment` such as
`/pb_data`.

Appaloft already has separate neutral concepts for this:

- `StorageVolume` and `ResourceStorageAttachment` for durable mounted storage;
- `ResourceInstance`, `ResourceBinding`, and `DependencyResourceBackup` for service dependencies
  such as Postgres or Redis.

The confusing part is the application-bundle and console readback language. Some planning and UI
surfaces still let a `volume` requirement look like a Dependency Resource. That makes users search
the Dependency Resources page for a mounted volume and may imply that SQLite-on-volume data is
covered by `dependency-resources.*` backup/restore operations.

That implication is wrong. A service dependency and a mounted storage volume have different
ownership, lifecycle, consistency, backup, and restore semantics.

Competitor research reinforces the split. Coolify exposes persistent storage as volume or bind
mount configuration, exposes database backups through service-specific backup commands and
S3-compatible targets, and separately documents that backing up the Coolify instance does not back
up application volume data. Appaloft should not copy Coolify's exact surface, but the separation is
evidence that "service database backup" and "mounted application data backup" are different product
and domain problems.

## Decision

Appaloft keeps `StorageVolume` and `DependencyResource` as separate public domain concepts.

`DependencyResource` means a service-like dependency consumed through a connection, readiness
contract, and safe secret references. Examples include Postgres, Redis, MySQL, ClickHouse,
object-storage, and OpenSearch.

`StorageVolume` means durable mounted filesystem or block-storage intent attached to a Resource or
application component. Examples include a Docker named volume, bind mount, provider volume, NFS
mount, or future cloud disk.

Blueprint and application bundle planning must use a neutral `ResourceRequirement` vocabulary:

- dependency kinds such as `postgres`, `redis`, `object-storage`, and `opensearch` compile to
  dependency resource planning, then to `ResourceInstance` and `ResourceBinding` work;
- `volume` compiles to storage planning, then to `StorageVolume` and
  `ResourceStorageAttachment` work.

Application bundle and installation read models must keep service dependency bindings separate
from storage bindings. Compatibility readers may keep legacy `dependencies` or
`dependencyResourceId` fields during a migration window, but new public contracts, UI copy, tests,
and docs must use storage language for `volume` requirements.

In public Blueprint and application-bundle contracts, `volume` is allowed to remain a
`ResourceRequirement` compatibility kind, but it must not produce `DependencyBinding` or
`DependencyResource` readback. It produces storage binding readback and Resource storage attachment
intent only.

The correction is split into three governed slices:

1. Resource visibility: Resource overview and settings must show mounted storage attachments,
   mount path, mount mode, storage volume kind/id, and an explicit backup capability status.
2. Application bundle storage boundary: public bundle plan/readback shapes must expose storage
   bindings separately from dependency bindings so downstream installers do not treat volumes as
   service dependencies.
3. Storage volume backup/restore: storage backup must be modeled as a storage/application-data
   capability, not as `DependencyResourceBackup`.

Storage backup/restore uses two independent extension axes:

- `BackupSourceAdapter`: how Appaloft obtains consistent data from the source. Examples include
  `tar-volume`, `file-copy`, `sqlite-online-backup`, `quiesce-and-copy`, `app-export`, and
  `provider-snapshot`.
- `BackupTargetProvider`: where Appaloft stores and retrieves backup artifacts. Examples include
  `local-filesystem`, `s3-compatible`, `webdav`, `restic-repository`, and
  `provider-volume-snapshot`.

Storage backup policy must model schedule, target, retention, consistency, compression/encryption,
size limits, and free-disk guards. Restore must default to a new volume or detached restore target.
In-place restore is destructive and requires explicit acknowledgement plus runtime quiesce/stop
safety.

Local backup is not disaster recovery when the backup target shares the same host or failure
domain as the source volume. Any local-only target must be labeled as such in read models and UI.

## Consequences

- `dependency-resources.*` backup/restore remains scoped to service dependency resources and must
  not claim coverage for SQLite or application files stored on a mounted volume.
- Resource and application-bundle read models must make mounted storage visible without sending
  users to Dependency Resources.
- Public Appaloft must provide neutral storage backup ports and operations before Cloud or another
  distribution adds hosted backup targets, quotas, commercial retention, or provider-specific
  adapters.
- Runtime volume cleanup remains separate from backup/restore and remains governed by ADR-064.
- `storage-volumes.delete` remains a control-plane lifecycle operation and must not delete backup
  artifacts or runtime volume realizations.

## Governed Specs

- [Storage Volume Backup And Restore Research](../specs/098-storage-volume-backup-restore/research.md)
- [Storage Volume Resource Visibility](../specs/096-storage-volume-resource-visibility/spec.md)
- [Application Bundle Storage Binding Boundary](../specs/097-application-bundle-storage-binding-boundary/spec.md)
- [Storage Volume Backup And Restore](../specs/098-storage-volume-backup-restore/spec.md)
- [S3-Compatible Storage Volume Backup Target](../specs/107-s3-compatible-storage-volume-backup-target/spec.md)
- [Storage Volume Lifecycle And Resource Attachment](../specs/032-storage-volume-lifecycle-and-resource-attachment/spec.md)
- [Dependency Resource Backup And Restore](../specs/039-dependency-resource-backup-restore/spec.md)
- [Storage Volume Runtime Realization And Cleanup](../specs/070-storage-volume-runtime-realization-and-cleanup/spec.md)
- [Blueprint Component Relation Boundary](./ADR-078-blueprint-component-relation-boundary.md)
- [Storage Volume Runtime Realization And Cleanup](./ADR-064-storage-volume-runtime-realization-and-cleanup.md)
- [Dependency Resource Backup And Restore Lifecycle](./ADR-036-dependency-resource-backup-restore-lifecycle.md)

## Implementation Notes

- Some Blueprint/application-bundle naming still calls all requirements dependency resources.
  Spec 097 owns the public neutral readback correction.
- Resource overview mounted-storage visibility is governed by Spec 096.
- Storage backup/restore operations are governed by Spec 098. Resource surfaces must route
  mounted SQLite/application data to StorageVolume backup planning and fail-closed blockers, not to
  DependencyResource backup actions.
- The first concrete offsite target is governed by Spec 107. It keeps source and target selection
  independent, transfers artifacts from the runtime through expiring authorization, persists only
  safe artifact handles, and leaves provider credentials and default-provider policy to downstream
  composition.
