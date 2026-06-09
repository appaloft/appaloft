# Research: Storage Volume Backup And Restore

## Competitor Reference

Coolify is a useful comparison point because it exposes persistent storage and database backups as
separate product surfaces:

- Coolify Persistent Storage documents Docker Engine storage as either a Docker volume or a bind
  mount, with a destination path inside the container and warnings about sharing storage between
  containers.
- Coolify Database Backups documents service-specific database backup commands and S3-compatible
  storage targets.
- Coolify Backup and Restore for the Coolify instance states that instance backup does not back up
  application data such as volume mounts; application data must be handled separately.
- Coolify S3 documentation models remote backup storage as a configured S3-compatible target that
  is verified before use.

References:

- https://coolify.io/docs/knowledge-base/persistent-storage
- https://coolify.io/docs/databases/backups
- https://coolify.io/docs/knowledge-base/how-to/backup-restore-coolify
- https://coolify.io/docs/knowledge-base/s3/introduction

## Appaloft Design Implications

- A mounted `StorageVolume` must be visible as storage, not as a service dependency.
- `DependencyResourceBackup` remains valid for service dependencies such as Postgres, MySQL,
  MariaDB, MongoDB, Redis, and object-storage-like service contracts.
- Storage backup must not silently mean "copy files". It needs a source consistency adapter because
  SQLite, application uploads, generated config, and arbitrary files have different safe read
  mechanisms.
- Backup target storage should be independent from source consistency. A local directory, S3,
  WebDAV, restic repository, or provider snapshot target should be selected through one
  `BackupTargetProvider` contract.
- Local backup is only local durability. If source and target share a host or failure domain, the
  read model and UI must label the artifact as local-only and not disaster recovery.
- Restore should default to a new `StorageVolume`; in-place restore is a destructive exceptional
  path with explicit acknowledgement and runtime quiesce/stop requirements.

## First Provider Candidates

| Capability | Candidate | Notes |
| --- | --- | --- |
| Source adapter | `tar-volume` | Generic baseline for stopped/quiesced filesystem data. |
| Source adapter | `sqlite-online-backup` | Needed for PocketBase-style SQLite when an online backup API or app-aware command exists. |
| Source adapter | `unsupported-live-file-copy` blocker | Required so Appaloft refuses unsafe live SQLite file copy. |
| Target provider | `local-filesystem` | Useful for self-hosted baseline, but always local-only when same host. |
| Target provider | `s3-compatible` | Remote/offsite target family, credentials by secret ref only. |
| Target provider | `restic-repository` | Future deduplicated target over local/S3/WebDAV-style backends. |

## Open Follow-Up Evidence

- Decide whether the first executable SQLite source adapter should run via runtime exec, app export,
  or a storage sidecar helper. If the public runtime lacks a neutral exec/quiesce hook, create a
  follow-up ADR before executing application-consistent backups.
- Decide whether scheduled storage backup should share the scheduled task runner infrastructure or
  a storage-backup-specific worker. The public operation contract should not assume a commercial
  hosted scheduler.
