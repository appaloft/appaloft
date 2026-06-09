# Tasks: Storage Volume Resource Visibility

## Source Of Truth

- [x] STOR-VIS-SOT-001: add ADR-083 for StorageVolume, DependencyResource, and backup boundary.
- [x] STOR-VIS-SOT-001: add phase 1 spec/plan/tasks under public Appaloft docs.
- [x] STOR-VIS-SOT-001: sync Domain Model, Resources, operation map, and storage test matrix.

## Test-First

- [x] STOR-VIS-OVERVIEW-001: add or update a public Web test for Resource overview mounted storage summary.
- [x] STOR-VIS-OVERVIEW-002: add or update an application query test for Resource storage attachment display name readback.
- [x] STOR-VIS-BACKUP-001: add or update a test proving StorageVolume backup status is explicit and separated from DependencyResource backup actions.
- [x] STOR-VIS-MOBILE-001: record browser verification target for desktop and mobile Resource overview when UI work is verified visually.

## Implementation

- [x] STOR-VIS-OVERVIEW-001: show Resource storage attachments on the overview tab using existing `resourceDetail.storageAttachments`.
- [x] STOR-VIS-OVERVIEW-002: enrich `resources.show.storageAttachments` with StorageVolume display name when available.
- [x] STOR-VIS-BACKUP-001: add clear backup/restore status copy for StorageVolume attachments in overview/settings.
- [x] STOR-VIS-DEPENDENCY-001: ensure Resource dependency copy does not route volume-backed SQLite users to DependencyResource backup.

## Entrypoints And Docs

- [x] Public Web Resource detail: add mounted storage summary and Settings Storage action.
- [x] Public docs/help: update Storage volumes and Dependency resources docs if user-facing docs need copy changes.

## Verification

- [x] Run targeted public Web/i18n tests.
- [x] Browser verify Resource overview desktop and mobile if UI changes are applied.

## Post-Implementation Sync

- [x] Reconcile spec, plan, tasks, matrix, tests, docs, and implementation.
