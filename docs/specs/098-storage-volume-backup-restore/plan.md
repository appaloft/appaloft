# Plan: Storage Volume Backup And Restore

## Governing Sources

- [ADR-083: Storage Volume, Dependency Resource, And Backup Boundary](../../decisions/ADR-083-storage-volume-dependency-resource-and-backup-boundary.md)
- [Storage Volume Lifecycle And Resource Attachment](../032-storage-volume-lifecycle-and-resource-attachment/spec.md)
- [Dependency Resource Backup And Restore](../039-dependency-resource-backup-restore/spec.md)
- [Storage Volume Test Matrix](../../testing/storage-volume-test-matrix.md)
- [Async Lifecycle And Acceptance](../../architecture/async-lifecycle-and-acceptance.md)

## Architecture Approach

- Model storage backup separately from `DependencyResourceBackup`.
- Add public source-adapter and target-provider ports before downstream/provider-specific
  adapters.
- Add command/query schemas and operation catalog entries after the readback contracts, admission
  blockers, and fake/local adapter tests exist.
- Keep provider SDKs, filesystem access, runtime exec, and object storage clients out of core
  aggregates.
- Plan before execution. `backup-plan` and `restore-plan` return safe previews and blockers.
- Default restore to a new StorageVolume; require explicit destructive acknowledgement for
  in-place restore.
- Treat local-only backups as not disaster recovery and enforce retention/free-disk guardrails.

## Public Contract Impact

- Active operation catalog additions under `storage-volumes.*`.
- CLI/API/Web/generated tool descriptors use the same command/query schemas.
- Persistence/read models store manual backup jobs, artifacts, and latest restore attempt readback.
- No change to `dependency-resources.*` backup/restore.

## Test Strategy

| ID | Automation | Binding |
| --- | --- | --- |
| STOR-BACKUP-PLAN-001 | command/API/CLI contract | operation catalog and use-case tests |
| STOR-BACKUP-PLAN-002 | application/adapter contract | unsupported live SQLite blocker tests |
| STOR-BACKUP-CREATE-001 | application/adapters | fake source adapter plus fake/local target provider tests |
| STOR-BACKUP-SQLITE-001 | source adapter | SQLite app-consistency or unsupported-blocker tests |
| STOR-BACKUP-RETENTION-001 | policy/admission | retention pruning and free-disk guard tests |
| STOR-BACKUP-RESTORE-001 | workflow/integration | restore-to-new-volume test |
| STOR-BACKUP-INPLACE-001 | unit/contract | destructive acknowledgement and quiesce/stop strategy tests |
| STOR-BACKUP-AUTHZ-001 | authorization/admission | role and quota/admission tests |

## Risks And Migration Gaps

- Provider snapshots and offsite backup targets require external systems; the first public
  repository iteration should use fakes/local adapters only.
- SQLite application-consistent backup may require runtime exec into a container or an
  application-specific export hook. If public runtime lacks a neutral exec/snapshot hook, pause for
  a public extension-point decision.
- Local backup can fill disks. Admission/free-disk checks and conservative defaults are mandatory
  before enabling execution.
- Restore can destroy data if in-place; restore-to-new-volume is required as the default.
