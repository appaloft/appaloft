# S3-Compatible Storage Volume Backup Target

## Status

- Round: Code
- Artifact state: Active
- Behavior id: `107-s3-compatible-storage-volume-backup-target`
- Governing behavior: [Storage Volume Backup And Restore](../098-storage-volume-backup-restore/spec.md)
- Governing decision: [ADR-083](../../decisions/ADR-083-storage-volume-dependency-resource-and-backup-boundary.md)

## Business Outcome

An Appaloft distribution can register an S3-compatible backup target for storage-volume backups
without putting long-lived object-storage credentials in the public domain model, commands,
read models, runtime target, or backup artifact handle. The same existing
`storage-volumes.*` plan/create/restore/prune operations then provide an offsite backup and
restore-to-new-volume flow.

## Ubiquitous Language

| Term | Meaning |
| --- | --- |
| Object transfer broker | Distribution-supplied port that grants short-lived upload/download authorization and deletes an object through provider credentials. |
| Transfer authorization | Expiring URL plus required non-secret request headers for one object action. |
| Safe artifact handle | Durable provider/object reference that contains no credential, authorization query, cookie, or secret header. |
| Runtime transfer | Upload or download executed on the storage volume's runtime target so the control plane does not buffer the backup artifact. |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| STOR-BACKUP-OFFSITE-PLAN-001 | Source and target axes remain independent | A Docker volume source adapter and registered `s3-compatible` target are available | A backup plan is requested | Tar or SQLite source selection depends on consistency/data format, not on the target provider; the plan reports `localOnly = false`. |
| STOR-BACKUP-OFFSITE-STORE-001 | Runtime uploads through short-lived authorization | A source artifact exists on a local-shell or generic-SSH runtime target | The S3-compatible target stores it | The runtime verifies size/checksum, uploads the file, returns only a safe artifact handle, and removes the working source artifact. |
| STOR-BACKUP-OFFSITE-RESTORE-001 | Offsite artifact restores to a new volume | A ready S3-compatible backup has a safe artifact handle and checksum | Restore is requested | The provider grants a short-lived download, verifies the downloaded checksum, restores into a newly created Docker volume, and removes the downloaded working file. |
| STOR-BACKUP-OFFSITE-PRUNE-001 | Prune removes provider object before state transition | A retained S3-compatible backup is pruned | The provider cleanup runs | The broker deletes the exact object; provider failure prevents the aggregate from being marked pruned. |
| STOR-BACKUP-OFFSITE-SECRET-001 | Durable and observable surfaces exclude authorization | Upload/download authorization is issued | Plan, backup readback, errors, logs, and script output are inspected | No signed URL, credential, secret header, cookie, or private key is persisted or emitted; authorization values are redacted from process errors. |

## Domain Ownership

- Public Appaloft owns the neutral object-transfer broker port, runtime transfer adapter, safe
  artifact-handle rules, and existing backup operation behavior.
- A downstream distribution owns provider account selection, credential resolution, bucket and
  key policy, quotas, commercial retention, and whether the provider is enabled.
- `StorageVolumeBackup` remains the public aggregate. No provider SDK type enters core or command
  schemas.

## Public Surfaces

- Existing `storage-volumes.backup-plan`, `create-backup`, `restore-plan`, `restore-backup`, and
  `prune-backups` operations; no new operation key is introduced.
- Runtime adapter exports an S3-compatible target provider and short-lived transfer broker port.
- `targetRef`, `secretRef`, and artifact handles remain safe references. Presigned URLs are
  execution-only values.

## Safety Rules

- Upload and download authorization must expire within one hour and must not become the artifact
  handle.
- Runtime scripts must fail closed when `curl`, Docker, the source artifact, or checksum evidence
  is unavailable.
- Restore remains restore-to-new-volume. In-place restore remains blocked.
- Provider object deletion must succeed before prune state is persisted.
- The S3-compatible provider must not be registered unless an object transfer broker is supplied.

## Non-Goals

- Scheduling, pre-deploy backup policy, whole-instance export/import, provider billing, quota, and
  hosted default-provider selection.
- WebDAV, restic, provider snapshot, Kubernetes volume snapshot, or in-place restore.
- Sending long-lived S3 credentials to workload servers.
