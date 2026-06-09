# Tasks: Storage Volume Backup And Restore

## Source Of Truth

- [x] STOR-BACKUP-SOT-001: add public spec/plan/tasks for StorageVolume backup/restore architecture.
- [x] STOR-BACKUP-SOT-001: update Storage Volume docs/workflows with backup/restore design when operations land.
- [x] STOR-BACKUP-SOT-001: record competitor research and design implications.
- [x] STOR-BACKUP-SOT-001: record downstream distribution docs as deferred until provider overlays are added.

## Test-First

- [x] STOR-BACKUP-PLAN-001: add operation catalog/schema tests for backup plan and restore plan.
- [x] STOR-BACKUP-PLAN-002: add unsupported live SQLite consistency blocker test.
- [x] STOR-BACKUP-CREATE-001: add fake source/target provider integration test.
- [x] STOR-BACKUP-SQLITE-001: add SQLite consistency test or unsupported blocker test.
- [x] STOR-BACKUP-RETENTION-001: add retention/free-disk guard tests.
- [x] STOR-BACKUP-RESTORE-001: add restore-to-new-volume workflow test.
- [x] STOR-BACKUP-INPLACE-001: add destructive acknowledgement test.
- [x] STOR-BACKUP-AUTHZ-001: add authorization/admission tests.

## Implementation

- [x] Add public backup source adapter and target provider ports.
- [x] Add backup job/artifact/read model.
- [x] Add plan/create/list/show/restore/prune command/query handlers.
- [x] Add fake adapters for tests and unsupported default provider registry for runtime safety.
- [x] Add Resource Storage UI backup plan/artifact surfaces.
- [x] Record downstream provider selection and quota/retention overlays as deferred after public ports land.

## Entrypoints And Docs

- [x] API: expose `storage-volumes.*` backup/restore operations.
- [x] CLI: expose `appaloft storage volume backup ...`.
- [x] Web: expose backup status, plan blockers, artifacts, restore-to-new-volume flow.
- [x] Docs: distinguish local backup, provider snapshot, and offsite backup.

## Verification

- [x] Run public storage backup unit/contract/integration tests.
- [x] Mark downstream authorization/admission tests not applicable until downstream overlays are added.
- [x] Mark local restore smoke deferred until a concrete local provider adapter lands.

## Post-Implementation Sync

- [x] Reconcile ADR, specs, docs, tests, operation catalog, and code.
- [x] Keep production external provider apply as a deferred gap until owner-approved readback exists.

## Deferred Outside Public Slice

- Downstream provider selection, quota, entitlement, and commercial retention overlays belong to
  the distribution that registers concrete providers.
- Local restore smoke with disposable volume data requires a real local source/target provider
  adapter; this public slice ships fake providers for tests and an unsupported default runtime
  registry so unsafe live copies stay blocked.
- Production external provider apply remains blocked until an owner approves provider readback,
  credential handling, and recovery evidence.
