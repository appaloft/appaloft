# Plan: Storage Volume Resource Visibility

## Governing Sources

- [ADR-083: Storage Volume, Dependency Resource, And Backup Boundary](../../decisions/ADR-083-storage-volume-dependency-resource-and-backup-boundary.md)
- [Storage Volume Lifecycle And Resource Attachment](../032-storage-volume-lifecycle-and-resource-attachment/spec.md)
- [Storage Volume Runtime Realization And Cleanup](../070-storage-volume-runtime-realization-and-cleanup/spec.md)
- [Dependency Resource Backup And Restore](../039-dependency-resource-backup-restore/spec.md)
- [Storage Volume Test Matrix](../../testing/storage-volume-test-matrix.md)

## Architecture Approach

- Use the current public `resources.show.storageAttachments` read model.
- Enrich `resources.show.storageAttachments` with display-safe StorageVolume name when the public
  `StorageVolumeReadModel` is available; keep id fallback so the detail query remains robust.
- Treat this as Resource detail query/UI projection work, not a new command.
- Keep Resource overview read-only and link to the existing Settings Storage management section.
- Show storage backup/restore status as Storage-owned and route operators to Settings Storage,
  where the governed Spec 098 operation family exposes plans, blockers, artifacts, restore, and
  prune controls.
- Do not route volume-backed application data to `dependency-resources.*` backup/restore actions.

## Public Contract Impact

- This visibility slice does not add a command, query, API route, CLI command, event, or config
  field. Storage backup commands/routes belong to Spec 098.
- Web/i18n strings change.
- Storage volume test matrix gains Resource overview visibility rows bound to Web tests.

## Test Strategy

| ID | Automation | Binding |
| --- | --- | --- |
| STOR-VIS-SOT-001 | docs/static | `docs/decisions/ADR-083-*`, this spec/plan/tasks, `docs/testing/storage-volume-test-matrix.md` |
| STOR-VIS-OVERVIEW-001 | Web static/unit and webview | `apps/web/src/lib/console/storage-volume-web.test.ts`; `apps/web/test/e2e-webview/home.webview.test.ts` |
| STOR-VIS-OVERVIEW-002 | application query unit | `packages/application/test/show-resource.test.ts` |
| STOR-VIS-BACKUP-001 | Web static/unit and i18n | `apps/web/src/lib/console/storage-volume-web.test.ts`; i18n locale assertions when present |
| STOR-VIS-DEPENDENCY-001 | docs/i18n static | docs and i18n assertions proving StorageVolume backup is not DependencyResource backup |
| STOR-VIS-MOBILE-001 | Bun.WebView layout/overflow | `apps/web/test/e2e-webview/home.webview.test.ts` checks Resource overview desktop and mobile storage summary visibility and horizontal overflow |

## Risks And Migration Gaps

- Resource overview should not duplicate the full Settings Storage management UI.
- Resource detail storage-name enrichment is best-effort; failures should not make Resource detail
  unavailable when attachment id/kind/path/mode readback is still safe.
- Resource overview visual coverage is bound to Bun.WebView desktop/mobile layout metrics in
  `apps/web/test/e2e-webview/home.webview.test.ts`; keep full manual screenshot review as an
  optional release polish step.
