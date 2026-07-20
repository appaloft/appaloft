# Storage Volume Backup And Restore

## Status

- Behavior id: `098-storage-volume-backup-restore`
- Round: Code + Sync
- Artifact state: active third slice for the storage/dependency boundary correction
- Roadmap target: governed storage/application-data protection for volume-backed applications
- Compatibility impact: additive future operation family; no change to DependencyResourceBackup
- Decision state: governed by ADR-083

## Business Outcome

Operators can plan, create, list, inspect, prune, and restore backups for volume-backed
application data without confusing the operation with DependencyResource backup. PocketBase SQLite
data under `/pb_data` should be backed up through an application-consistent SQLite strategy when
supported, or blocked with a clear unsupported consistency reason when it is not.

Backup source consistency and backup target storage are independently pluggable. A source adapter
decides how to read consistent data. A target provider decides where the backup artifact is stored.

This spec is intentionally different from dependency-resource backup. Database service backups may
run service-specific dump commands and upload to a target such as S3. Mounted application data may
need filesystem copy, runtime quiesce, SQLite online backup, app export, or provider snapshot
semantics before an artifact is safe.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| StorageVolumeBackup | Backup record/artifact for a StorageVolume or ResourceStorageAttachment source. | Storage backup | volume backup |
| ApplicationDataBackup | App-aware backup grouping one or more storage volume backups. | Application bundle / future installed app readback | app backup |
| BackupSourceAdapter | Strategy that obtains consistent bytes or provider snapshots from source data. | Provider/application port | source adapter |
| BackupTargetProvider | Strategy that stores and retrieves backup artifacts. | Provider/application port | backup destination |
| BackupPolicy | Schedule, target, retention, consistency, compression/encryption, and guardrails. | Storage backup | backup schedule |
| BackupJob | One execution attempt and status/readback. | Storage backup | backup run |
| BackupArtifact | Safe restore point readback with manifest, checksum, size, target ref, and expiry. | Storage backup | restore point |
| RestorePlan | Dry-run restore preview, defaulting to restore-to-new-volume. | Storage restore | restore preview |
| LocalOnlyBackup | Backup artifact stored on the same host or failure domain as the source. | Storage backup | local backup |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| STOR-BACKUP-SOT-001 | Source of truth defines backup architecture | StorageVolume and DependencyResource boundaries are split | This phase starts | Spec/plan/tasks define source adapters, target providers, retention/admission, restore safety, and public/downstream ownership. |
| STOR-BACKUP-PLAN-001 | Backup plan chooses compatible source and target | A StorageVolume backup request declares source, consistency, and target | The operator previews backup | API returns a safe plan with adapter/provider, estimated size when known, consistency level, local-only warning, retention impact, and no secret values. |
| STOR-BACKUP-PLAN-002 | Unsupported consistency blocks unsafe copy | A live SQLite-backed attachment requests `application-consistent` backup and no compatible adapter exists | The operator previews backup | Plan returns a blocker and does not fall back to live file copy. |
| STOR-BACKUP-CREATE-001 | Backup execution writes verified artifact | The operator accepts a backup plan | Backup worker executes | Source adapter streams data to target provider, checksum is computed, artifact manifest is persisted, and status/readback is safe. |
| STOR-BACKUP-SQLITE-001 | SQLite data uses app-consistent adapter when available | PocketBase volume contains SQLite data | Backup policy requests `application-consistent` | System uses SQLite/PocketBase-aware backup or blocks with unsupported consistency; it does not silently file-copy live SQLite. |
| STOR-BACKUP-RETENTION-001 | Retention prevents unbounded local growth | Local backup policy has max count/age/bytes/free-disk guards | Backup completes or prune runs | Prune runs only after new artifact verification unless explicitly requested; it preserves minimum restore points and refuses when disk guard would be violated. |
| STOR-BACKUP-RESTORE-001 | Restore defaults to new volume | The operator restores a volume backup | Restore plan is accepted | System creates or identifies a new StorageVolume, restores artifact there, and requires explicit attach/switch action before replacing runtime mount. |
| STOR-BACKUP-INPLACE-001 | Destructive restore is guarded | The operator requests in-place restore | Restore plan is generated | Plan marks destructive risk, requires acknowledgement, runtime quiesce/stop strategy, and rollback evidence before execution. |
| STOR-BACKUP-AUTHZ-001 | Backup/restore is permission and quota guarded | Viewer/developer/admin/owner roles attempt operations | Operation guard runs | Queries follow read policy; create/restore/delete/prune are owner/admin gated initially and pass storage/backup quota/admission context. |

## Domain Ownership

- Bounded context: Storage Backup and Restore, downstream of Storage Volume Lifecycle.
- Aggregate/resource owner:
  - Public Appaloft owns neutral backup policy/job/artifact contracts, operation keys,
    source/target provider ports, local/self-hosted adapters, and restore safety.
  - Downstream distributions may provide hosted target providers, quota policy, commercial
    retention, managed object storage credentials by secret ref, and approval gates.
- Related contexts:
  - Storage Volume Lifecycle provides sources and attachments.
  - DependencyResource backup remains separate.
  - Application bundle or downstream installed-application readback may group multiple volume
    backups as ApplicationDataBackup later.

## Public Surfaces

Active operation family:

- `storage-volumes.backup-plan`
- `storage-volumes.create-backup`
- `storage-volumes.list-backups`
- `storage-volumes.show-backup`
- `storage-volumes.restore-plan`
- `storage-volumes.restore-backup`
- `storage-volumes.prune-backups`

CLI shape:

- `appaloft storage volume backup plan|create|list|show|restore-plan|restore|prune`

Web/UI:

- Resource Storage section shows backup policies, artifacts, and restore plans.
- Resource overview shows backup capability/status for mounted storage.
- Restore UI defaults to a new volume and explicit attach/switch.

Config:

- Backup target provider refs and credentials are secret refs only.
- Local backup target requires max bytes and free-disk guardrails.

Events:

- Domain facts for backup planned/accepted/started/succeeded/failed/pruned/restored may be emitted
  only after required persistence. These are not billing events.

Public docs/help:

- Docs must distinguish local backup, provider snapshot, and offsite backup.

Current implementation note:

- The operation family, command/query handlers, persistence read models, CLI, HTTP/oRPC, typed
  client contract, and Web Resource storage surface are active.
- The default public runtime registers a local-shell/generic-SSH Docker named-volume backup
  registry for `sqlite-online-backup`/`tar-volume` to `local-filesystem`. It stores verified tar
  artifacts on the selected deployment target and restores to a new Docker named volume by default.
  Local Docker and generic-SSH Docker smoke gates prove this path with PocketBase-style SQLite
  data.
- Runtime command differences are kept inside the runtime adapter/provider boundary. The current
  executable renderer is `posix-shell-docker`; other OS/platform command families must register a
  runtime command renderer/provider instead of changing application use cases or callers.
- Live SQLite application-consistent backup uses the SQLite-aware source adapter; the runtime tar
  adapter refuses that plan instead of copying live SQLite files unsafely.
- S3-compatible offsite transfer is available when a downstream distribution registers the
  short-lived object-transfer broker governed by Spec 107. WebDAV, restic, and automatic
  OS/platform target detection remain provider/runtime follow-up work.

## Consistency Levels

| Level | Meaning |
| --- | --- |
| `crash-consistent` | Similar to filesystem state after power loss. |
| `quiesced` | Workload writes are stopped or paused before copying. |
| `application-consistent` | Uses application or data-format aware mechanisms such as SQLite backup API or app export. |
| `provider-snapshot-consistent` | Uses a provider-declared snapshot consistency contract. |

## Public Port Shape

Storage backup execution uses two public extension axes:

### BackupSourceAdapter

The source adapter validates and reads the source consistently. It receives Resource/StorageVolume
ids, mount path, requested consistency, quiesce strategy, and runtime context refs. It returns a
safe stream or provider snapshot reference plus a manifest fragment. It must not know where the
artifact is stored.

Initial adapter keys:

- `tar-volume`
- `sqlite-online-backup`
- `quiesce-and-copy`
- `app-export`
- `provider-snapshot`
- `unsupported`

### BackupTargetProvider

The target provider stores, retrieves, and deletes backup artifacts. It receives a stream or source
snapshot reference plus a target configuration ref. It returns artifact handle, checksum, size, and
locality/readback metadata. It must not decide source consistency.

Initial provider keys:

- `local-filesystem`
- `s3-compatible`
- `webdav`
- `restic-repository`
- `provider-volume-snapshot`

Credentials must be passed as secret refs or resolved adapter context only. Provider credentials,
pre-signed URLs, raw headers, and command output must not appear in plans, artifacts, logs, events,
or UI.

## Retention And Admission

Backup policy must include:

- schedule or manual-only state;
- source adapter preference and minimum consistency;
- target provider ref;
- retention max count, max age, and max bytes;
- free-disk guard for local targets;
- compression and encryption settings;
- local-only/disaster-recovery classification;
- prune strategy.

Prune after backup defaults to "verify new artifact first, then prune". If no verified artifact is
created, automatic prune must not delete the last retained restore point. Local target admission
must fail when projected free disk would cross the configured guard.

## Restore Safety

Restore planning must default to a new `StorageVolume` or detached restore target. In-place restore
requires all of:

- explicit destructive acknowledgement;
- target Resource runtime stop/quiesce strategy;
- source artifact checksum verification;
- rollback evidence or operator acknowledgement that rollback is unavailable;
- clear statement that dependency-resource restore commands are not involved.

## Non-Goals

- No claim that local backup is disaster recovery.
- No direct provider credential values in plans, readbacks, logs, docs, or tests.
- No in-place restore by default.
- No reuse of `DependencyResourceBackup` for SQLite-on-volume.
- No production external target/provider creation without explicit owner approval and readback
  evidence.

## Open Questions

- Whether `ApplicationDataBackup` should be its own aggregate in this slice or a follow-up
  projection over multiple StorageVolumeBackup jobs.
- Whether scheduled storage backup runner belongs in public shell first or a downstream worker
  first.
- Which first source adapter should ship: generic `tar-volume`, `sqlite-online-backup`, or
  restore-to-new-volume provider snapshot.
