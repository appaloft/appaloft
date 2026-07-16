# Storage Volume Test Matrix

## Scope

This matrix covers Phase 7 storage volume lifecycle and resource attachment baseline:

- `storage-volumes.create`
- `storage-volumes.list`
- `storage-volumes.show`
- `storage-volumes.rename`
- `storage-volumes.delete`
- `storage-volumes.cleanup-runtime`
- `storage-volumes.backup-plan`
- `storage-volumes.create-backup`
- `storage-volumes.list-backups`
- `storage-volumes.show-backup`
- `storage-volumes.restore-plan`
- `storage-volumes.restore-backup`
- `storage-volumes.prune-backups`
- `resources.attach-storage`
- `resources.detach-storage`
- `resources.show` storage attachment summaries

## Global References

- [Storage Volume Lifecycle Workflow](../workflows/storage-volume-lifecycle.md)
- [ADR-083: Storage Volume, Dependency Resource, And Backup Boundary](../decisions/ADR-083-storage-volume-dependency-resource-and-backup-boundary.md)
- [Storage Volume Lifecycle And Resource Attachment](../specs/032-storage-volume-lifecycle-and-resource-attachment/spec.md)
- [Storage Volume Runtime Realization And Cleanup](../specs/070-storage-volume-runtime-realization-and-cleanup/spec.md)
- [Storage Volume Resource Visibility](../specs/096-storage-volume-resource-visibility/spec.md)
- [Application Bundle Storage Binding Boundary](../specs/097-application-bundle-storage-binding-boundary/spec.md)
- [Storage Volume Backup And Restore](../specs/098-storage-volume-backup-restore/spec.md)
- [Repository Config Storage Graph](../specs/076-repository-config-storage-graph/spec.md)
- [ADR-064: Storage Volume Runtime Realization And Cleanup](../decisions/ADR-064-storage-volume-runtime-realization-and-cleanup.md)
- [ADR-067: Repository Config Storage Graph](../decisions/ADR-067-repository-config-storage-graph.md)
- [Resource Profile Lifecycle](../workflows/resource-profile-lifecycle.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Coverage Rows

| ID | Operation | Type | Scenario | Expected | Automation Binding |
| --- | --- | --- | --- | --- | --- |
| STOR-VOL-CREATE-001 | `storage-volumes.create` | Core/application | Create named volume. | Persists active volume, emits `storage-volume-created`, returns `ok({ id })`. | `packages/core/test/storage-volume.test.ts`; `packages/application/test/storage-volume-lifecycle.test.ts` |
| STOR-VOL-CREATE-002 | `storage-volumes.create` | Core/application | Create bind mount with safe source path. | Persists bind source path as provider/runtime boundary data. | `packages/application/test/storage-volume-lifecycle.test.ts` |
| STOR-VOL-CREATE-003 | `storage-volumes.create` | Core/application | Bind source path is unsafe. | Returns `validation_error`, `phase = storage-volume-validation`, no mutation. | `packages/core/test/storage-volume.test.ts`; `packages/application/test/storage-volume-lifecycle.test.ts` |
| STOR-VOL-RENAME-001 | `storage-volumes.rename` | Application | Rename active volume. | Changes name/slug, emits `storage-volume-renamed`, does not mutate attachments. | `packages/application/test/storage-volume-lifecycle.test.ts` |
| STOR-VOL-DELETE-001 | `storage-volumes.delete` | Application | Delete unattached volume with no backup blocker. | Tombstones/deletes volume and normal reads omit it. | `packages/application/test/storage-volume-lifecycle.test.ts` |
| STOR-VOL-DELETE-002 | `storage-volumes.delete` | Application/persistence | Delete attached volume. | Returns `storage_volume_delete_blocked` with attachment blocker details. | `packages/core/test/storage-volume.test.ts`; `packages/application/test/storage-volume-lifecycle.test.ts`; `packages/persistence/pg/test/storage-volume.pglite.test.ts` |
| STOR-VOL-DELETE-003 | `storage-volumes.delete` | Application | Delete volume with backup relationship blocker. | Returns `storage_volume_delete_blocked`; backup data unchanged. | `packages/application/test/storage-volume-lifecycle.test.ts` |
| STOR-ATTACH-001 | `resources.attach-storage` | Core/application | Attach active volume to active resource at safe destination. | Persists resource attachment, emits `resource-storage-attached`, returns `ok({ id })`. | `packages/core/test/resource-storage-attachment.test.ts`; `packages/application/test/storage-volume-lifecycle.test.ts`; `packages/persistence/pg/test/storage-volume.pglite.test.ts` |
| STOR-ATTACH-002 | `resources.attach-storage` | Core/application | Duplicate destination path on same resource. | Returns `conflict`, `phase = resource-storage-attachment`, no mutation. | `packages/core/test/resource-storage-attachment.test.ts`; `packages/application/test/storage-volume-lifecycle.test.ts` |
| STOR-ATTACH-003 | `resources.attach-storage` | Application | Archived resource. | Returns `resource_archived`, no event. | `packages/application/test/storage-volume-lifecycle.test.ts` |
| STOR-ATTACH-004 | `resources.attach-storage` | Core/application | Unsafe destination path. | Returns `validation_error`, `phase = resource-storage-attachment`, no mutation. | `packages/core/test/resource-storage-attachment.test.ts`; `packages/application/test/storage-volume-lifecycle.test.ts` |
| STOR-DETACH-001 | `resources.detach-storage` | Application | Detach existing attachment. | Removes attachment, emits `resource-storage-detached`, StorageVolume remains. | `packages/core/test/resource-storage-attachment.test.ts`; `packages/application/test/storage-volume-lifecycle.test.ts` |
| STOR-READ-001 | `storage-volumes.list/show` | Query/read model | Volume has attachments. | Returns safe attachment summaries. | `packages/application/test/storage-volume-lifecycle.test.ts`; `packages/persistence/pg/test/storage-volume.pglite.test.ts` |
| STOR-READ-002 | `resources.show` | Query/read model | Resource has storage attachments. | Returns `storageAttachments` in `resources.show/v1`. | `packages/application/test/show-resource.test.ts` |
| STOR-SNAPSHOT-001 | deployment snapshot | Application + runtime resolver | Resource with storage attachments creates a deployment plan/snapshot. | Requested deployment input and immutable runtime plan metadata contain provider-neutral mount entries with volume kind/source snapshot; no storage command provider provisioning occurs. | `packages/application/test/create-deployment.test.ts`; `packages/adapters/runtime/test/runtime-plan-resolver.test.ts` |
| STOR-RUNTIME-001 | Docker runtime mounts | Runtime adapter | Runtime plan has `storage.mounts` metadata. | Local/generic-SSH Docker container commands include deterministic named-volume or bind-mount `--mount` flags; Docker Compose executions include the same mounts in the generated Appaloft override file; Docker Swarm image service apply plans include the same mounts in `docker service create`; Docker Swarm Compose stack plans include the same mounts in the generated stack override; invalid metadata fails before start. | `packages/adapters/runtime/test/storage-runtime-mounts.test.ts`; `packages/adapters/runtime/test/runtime-command-builder.test.ts`; `packages/adapters/runtime/test/compose-label-overrides.test.ts`; `packages/adapters/runtime/test/docker-swarm-runtime-intent.test.ts`; `packages/adapters/runtime/test/docker-swarm-execution-backend.test.ts` |
| STOR-REALIZE-001 | deployment execution | Runtime adapter | Deployment snapshot has storage mount metadata. | Runtime adapters realize storage only as part of deployment execution, consume immutable snapshot metadata, and attach Appaloft ownership labels to Docker named-volume realizations where the runtime supports labels. | `packages/adapters/runtime/test/storage-runtime-mounts.test.ts`; `packages/adapters/runtime/test/runtime-command-builder.test.ts`; `packages/adapters/runtime/test/compose-label-overrides.test.ts`; `packages/adapters/runtime/test/docker-swarm-runtime-intent.test.ts`; `packages/adapters/runtime/test/docker-swarm-execution-backend.test.ts` |
| STOR-REALIZE-002 | `storage-volumes.create` | Application/runtime boundary | Operator creates a storage volume record. | Command persists provider-neutral state only and does not invoke runtime/provider provisioning. | `packages/application/test/storage-volume-lifecycle.test.ts`; `packages/adapters/runtime/test/storage-runtime-mounts.test.ts` |
| STOR-REALIZE-003 | Docker Swarm Compose stack | Runtime adapter | Resource uses Docker Compose on a Docker Swarm stack target with explicit target service metadata. | Runtime renders a bounded `docker stack deploy` candidate stack with an Appaloft-generated override for identity labels, runtime env/secret references, storage mounts, top-level volume ownership labels, and the edge network; route labels are promoted after target service verification, superseded Appaloft-labeled stacks/services are cleaned without broad prune, and the local explicit/GitHub Actions real Swarm smoke proves named-volume creation plus route reachability. | `packages/adapters/runtime/test/docker-swarm-runtime-intent.test.ts`; `packages/adapters/runtime/test/docker-swarm-execution-backend.test.ts` |
| STOR-CLEANUP-001 | `storage-volumes.cleanup-runtime` | Application/runtime | Runtime target has eligible Appaloft-owned volume realizations older than cutoff. | Dry-run is default and returns safe candidate/blocker diagnostics without deleting runtime volumes. | `packages/application/test/storage-volume-runtime-cleanup.test.ts`; `packages/adapters/runtime/test/storage-runtime-cleanup.test.ts` |
| STOR-CLEANUP-002 | `storage-volumes.cleanup-runtime` | Application/runtime | Eligible candidates pass Appaloft ownership-label evidence, all safety evidence, and `dryRun = false`. | Only matched safe runtime volume realizations are removed; missing or mismatched ownership labels are blocked as `ownership-unproven`, and broad prune commands are never used. | `packages/application/test/storage-volume-runtime-cleanup.test.ts`; `packages/adapters/runtime/test/storage-runtime-cleanup.test.ts` |
| STOR-CLEANUP-003 | `storage-volumes.cleanup-runtime` | Application/runtime | Candidate is referenced by active attachment, active runtime, retained snapshot, rollback candidate, backup retention, in-flight backup/restore work, or provider safety blocker. | Candidate is skipped with stable safe blocker reason. | `packages/application/test/storage-volume-runtime-cleanup.test.ts`; `packages/adapters/runtime/test/storage-runtime-cleanup.test.ts` |
| STOR-CLEANUP-004 | `storage-volumes.cleanup-runtime` | Application/runtime adapter | Candidate refers to a bind-mount source path. | Cleanup never deletes the host path and returns a stable `bind-mount-unsupported` blocked candidate instead of cleaning. | `packages/application/test/storage-volume-runtime-cleanup.test.ts`; `packages/adapters/runtime/test/storage-runtime-cleanup.test.ts` |
| STOR-CLEANUP-005 | `storage-volumes.cleanup-runtime` | Entrypoint | CLI or HTTP/oRPC invokes cleanup. | Entrypoints dispatch `CleanupStorageVolumeRuntimeCommand` through the command bus using one shared schema. | `packages/adapters/cli/test/storage-volume-command.test.ts`; `packages/orpc/test/storage-volume.http.test.ts` |
| STOR-CLEANUP-006 | GitHub Actions + local explicit real local Docker cleanup | Runtime adapter | `.github/workflows/storage-cleanup-e2e.yml` runs the Docker gate from nightly/release, or `APPALOFT_E2E_STORAGE_CLEANUP_DOCKER=true` is set locally with Docker available. | Storage runtime cleanup dry-runs a real Appaloft-named Docker volume as `matched`, preserves it, then destructive cleanup removes only that scoped volume. | `packages/adapters/runtime/test/storage-runtime-cleanup.test.ts`; `bun run smoke:storage-cleanup:docker`; `.github/workflows/storage-cleanup-e2e.yml` |
| STOR-CLEANUP-007 | GitHub Actions secret-gated + local explicit real generic-SSH Docker cleanup | Runtime adapter | `.github/workflows/storage-cleanup-e2e.yml` runs the SSH gate when secrets exist, or `APPALOFT_E2E_SSH_STORAGE_CLEANUP_DOCKER=true` and SSH target credentials are configured locally. | Storage runtime cleanup performs the same dry-run-first and destructive scoped Docker volume cleanup over generic SSH; release dispatch can require SSH evidence and fail closed when secrets are absent. | `packages/adapters/runtime/test/storage-runtime-cleanup.test.ts`; `bun run smoke:storage-cleanup:ssh`; `.github/workflows/storage-cleanup-e2e.yml` |
| STOR-ENTRY-001 | Operation catalog | Catalog | Storage operations are public. | Operation catalog and `CORE_OPERATIONS.md` contain one row per operation; no generic update. | `packages/application/test/operation-catalog-boundary.test.ts`; `packages/docs-registry/test/operation-coverage.test.ts` |
| STOR-ENTRY-002 | CLI | Entrypoint | Storage and attach/detach commands submitted. | CLI dispatches command/query bus using application schema. | `packages/adapters/cli/test/storage-volume-command.test.ts` |
| STOR-ENTRY-003 | oRPC/HTTP | Entrypoint | Storage and attach/detach routes submitted. | Routes dispatch command/query bus using application schema. | `packages/orpc/test/storage-volume.http.test.ts` |
| STOR-CONFIG-001 | Repository config | Entrypoint workflow | `appaloft.yaml` declares managed storage mounted at a workload path. | Config deploy lists/creates a managed named volume, reads/attaches Resource storage, writes preview provenance when ephemeral, and keeps `deployments.create` ids-only. | `packages/deployment-config/test/appaloft-config.test.ts`; `packages/adapters/cli/test/deployment-config.test.ts` |
| STOR-CONFIG-002 | Preview cleanup | Application workflow | Preview source link has repository-config storage provenance. | `deployments.cleanup-preview` detaches/deletes only provenance-owned ephemeral storage and preserves manual/shared storage without provenance. | `packages/application/test/cleanup-preview.test.ts` |
| STOR-WEB-001 | Web Resource detail | Entrypoint | Operator opens the Resource Overview storage section. | Web lists project/environment storage volumes, displays current `resources.show` storage attachments, dispatches `resources.attach-storage` and `resources.detach-storage` through shared oRPC clients, and links the public storage-volume docs anchor. It does not provision provider-native volumes or delete provider-native storage. | `apps/web/src/lib/console/storage-volume-web.test.ts`; `apps/web/test/e2e-webview/home.webview.test.ts` |
| STOR-WEB-002 | Web Resource detail | Entrypoint | Operator manages provider-neutral storage volume records from the Resource storage section. | Web dispatches `storage-volumes.create`, `storage-volumes.rename`, and `storage-volumes.delete` through shared oRPC clients with i18n text and keeps provider-native provisioning out of the UI. | `apps/web/src/lib/console/storage-volume-web.test.ts`; `apps/web/test/e2e-webview/home.webview.test.ts` covers create route behavior. |
| STOR-WEB-003 | Web Resource detail | Entrypoint | Operator runs storage runtime cleanup from the Resource storage section. | Web dispatches `storage-volumes.cleanup-runtime` through the shared oRPC client, defaults the operator flow to dry-run preview, and requires destructive confirmation before sending `dryRun = false`. | `apps/web/src/lib/console/storage-volume-web.test.ts`; `apps/web/test/e2e-webview/home.webview.test.ts` |
| STOR-VIS-OVERVIEW-001 | Web Resource detail | Entrypoint | Operator opens Resource overview for a Resource with storage attachments such as PocketBase `/pb_data`. | Overview shows mounted storage count, storage volume id/kind, destination path, mount mode, and a Storage settings action. | `apps/web/src/lib/console/storage-volume-web.test.ts`; `apps/web/test/e2e-webview/home.webview.test.ts` |
| STOR-VIS-OVERVIEW-002 | `resources.show` | Query/read model | A Resource attachment references a known StorageVolume. | Resource detail returns attachment id, storage volume id/kind/name when available, destination path, mount mode, and attached timestamp; missing volume name does not hide the attachment. | `packages/application/test/show-resource.test.ts` |
| STOR-VIS-BACKUP-001 | Web Resource detail | Entrypoint | Resource has mounted storage and operator opens Resource storage settings. | UI exposes StorageVolume backup plan, blocker readback, artifact list, restore-to-new-volume, and prune controls through `storageVolumes.backups.*`; it does not route the user to DependencyResource backup actions. | `apps/web/src/lib/console/storage-volume-web.test.ts`; `apps/web/test/e2e-webview/home.webview.test.ts` |
| STOR-VIS-DEPENDENCY-001 | Docs/i18n | Static | Blueprint or application bundle has a `volume` requirement. | Public docs and UI wording keep volume-backed data under StorageVolume/ResourceStorageAttachment instead of DependencyResource backup. | `docs/specs/096-storage-volume-resource-visibility/spec.md`; `packages/i18n/src/locales/*.ts` |
| STOR-VIS-MOBILE-001 | Web Resource detail | Browser/manual | Resource overview is opened at a narrow viewport with long storage ids or paths. | Mounted storage rows wrap safely without horizontal overflow. | manual/browser verification when UI layout changes are visually checked |
| APP-BUNDLE-STORAGE-PLAN-001 | `@appaloft/blueprints` | Package/unit | Blueprint component declares a `volume` requirement and storage mount. | Application bundle exposes storage binding readback separately from dependency bindings. | `packages/blueprints/test/blueprint-install-plan.test.ts` |
| APP-BUNDLE-STORAGE-PLAN-002 | `@appaloft/blueprints` | Package/unit | Blueprint component declares service dependencies such as Postgres and Redis. | Service requirements remain dependency bindings and do not become StorageBindings. | `packages/blueprints/test/blueprint-install-plan.test.ts` |
| APP-BUNDLE-STORAGE-PLAN-003 | `@appaloft/blueprints` | Package/unit | Blueprint component lists a `volume` under `usesResources`. | Install plan and bundle plan do not produce `bind-dependency`, dependency readback, dependency readiness wait, or dependency env for the volume. | `packages/blueprints/test/blueprint-install-plan.test.ts` |
| APP-BUNDLE-STORAGE-RUNTIME-001 | `@appaloft/blueprints` | Package/unit | Runtime projection is generated from a bundle with storage mounts. | Runtime storage mounts expose canonical `storageRequirementId` and storage binding refs while retaining deprecated compatibility aliases. | `packages/blueprints/test/blueprint-install-plan.test.ts` |
| STOR-BACKUP-PLAN-001 | Storage backup contract | Application/unit + entrypoints | A storage backup plan request declares a source adapter class, target provider, consistency level, and retention policy. | Safe plan reports source adapter, target provider, consistency, local-only status, retention impact, and no secret values through application, CLI, HTTP/oRPC, typed client, and Web surfaces. | `packages/application/test/storage-volume-backup-contract.test.ts`; `packages/application/test/storage-volume-backup-restore.test.ts`; `packages/adapters/cli/test/storage-volume-command.test.ts`; `packages/orpc/test/storage-volume.http.test.ts`; `apps/web/src/lib/console/storage-volume-web.test.ts` |
| STOR-BACKUP-PLAN-002 | Storage backup contract | Application/unit | Operator requests application-consistent backup for live SQLite data and no compatible source adapter exists. | Plan returns an unsupported consistency blocker instead of falling back to unsafe live file copy. | `packages/application/test/storage-volume-backup-contract.test.ts` |
| STOR-BACKUP-SQLITE-001 | Storage backup contract | Application/unit | A live SQLite source has an application-consistent source adapter available. | Plan selects the SQLite-aware source adapter and does not silently use generic file copy. | `packages/application/test/storage-volume-backup-contract.test.ts` |
| STOR-BACKUP-RETENTION-001 | Storage backup contract | Application/unit | Local backup target lacks bounded retention or a free-disk guard. | Plan returns retention/free-disk blockers so local backup cannot grow without guardrails. | `packages/application/test/storage-volume-backup-contract.test.ts` |
| STOR-BACKUP-CREATE-001 | Storage backup command | Application/unit | Backup execution has compatible fake source and target providers. | Source adapter creates a consistent source result, target provider stores a verified artifact, and the read model returns a ready restore point. | `packages/application/test/storage-volume-backup-restore.test.ts` |
| STOR-BACKUP-RUNTIME-001 | Storage backup runtime provider | Runtime/unit | Runtime has a Docker named-volume source and local filesystem target. | Runtime registry exposes `sqlite-online-backup`, `tar-volume`, and `local-filesystem`, selects SQLite-aware backup for live application-consistent SQLite, renders Docker ownership-checked source/store/restore scripts through the `posix-shell-docker` runtime command renderer, runs the SQLite helper as the invoking runtime UID/GID so its private bind-mounted work directory remains writable on native Linux, proves the renderer can be swapped by dialect without changing callers, and refuses live SQLite `application-consistent` backup through generic tar copy. | `packages/adapters/runtime/test/storage-volume-backup-provider.test.ts` |
| STOR-BACKUP-RUNTIME-002 | Local explicit real Docker backup/restore | Runtime adapter | `APPALOFT_E2E_STORAGE_BACKUP_DOCKER=true` is set locally with Docker available. | Runtime provider backs up a real Appaloft-labeled Docker named volume containing PocketBase-style `data.db`, stores the local filesystem artifact without weakening work-directory permissions, restores to a new Docker named volume, and verifies the restored SQLite content and sibling files. | `packages/adapters/runtime/test/storage-volume-backup-provider.test.ts`; `bun run smoke:storage-backup:docker` |
| STOR-BACKUP-RUNTIME-003 | GitHub Actions secret-gated + local explicit real generic-SSH Docker backup/restore | Runtime adapter | `.github/workflows/storage-backup-e2e.yml` runs the SSH gate when secrets exist, or `APPALOFT_E2E_SSH_STORAGE_BACKUP_DOCKER=true` and SSH target credentials are configured locally. | Runtime provider performs the same PocketBase-style SQLite backup/store/restore proof on the selected generic-SSH Docker target, stores the artifact under that target's local filesystem `targetRef`, restores to a new Docker named volume on that target, verifies restored SQLite content, and release dispatch can require SSH evidence and fail closed when secrets are absent. | `packages/adapters/runtime/test/storage-volume-backup-provider.test.ts`; `bun run smoke:storage-backup:ssh`; `.github/workflows/storage-backup-e2e.yml` |
| STOR-BACKUP-RESTORE-001 | Storage restore command | Application/unit | Operator restores a storage volume backup. | Restore defaults to a new StorageVolume and requires explicit attach/switch before replacing runtime mount. | `packages/application/test/storage-volume-backup-restore.test.ts` |
| STOR-BACKUP-INPLACE-001 | Storage restore command/query | Application/unit | Operator requests in-place restore. | Restore plan and execution are blocked unless a future destructive restore strategy is explicitly enabled. | `packages/application/test/storage-volume-backup-restore.test.ts` |
| STOR-BACKUP-ENTRY-001 | CLI/API/Web | Entrypoint | Storage backup commands and routes submitted. | Entrypoints dispatch the shared storage backup command/query schemas and do not call dependency backup APIs. | `packages/adapters/cli/test/storage-volume-command.test.ts`; `packages/orpc/test/storage-volume.http.test.ts`; `apps/web/src/lib/console/storage-volume-web.test.ts` |

## Required Non-Coverage Assertions

Tests must assert storage commands do not:

- create deployments;
- mutate historical deployment snapshots;
- restart, stop, prune, or clean runtime state;
- explicitly provision provider-native Docker/Compose/Swarm volumes outside deployment execution;
- run runtime volume cleanup through `servers.capacity.prune` or `storage-volumes.delete`;
- delete bind-mount source paths;
- accept host bind source paths, provider-native handles, or provider accounts from repository
  config;
- bind or unbind dependency resources;
- perform backup or restore through the current lifecycle operations;
- route mounted SQLite/application files through DependencyResource backup/restore;
- expose secrets, credentials, auth headers, cookies, provider tokens, or private keys.

## Current Implementation Notes And Governed Follow-Ups

This baseline implements storage volume lifecycle, Resource attachment profile mutation, read
models, CLI/oRPC route contracts, delete-safety gates, and provider-neutral deployment snapshot
metadata for current ResourceStorageAttachment entries. Local and generic-SSH Docker container
execution now consume that metadata as Docker `--mount` flags and pre-create Docker named volumes
with Appaloft ownership labels during deployment execution. Docker Compose execution writes the
same named-volume/bind-mount entries plus top-level volume ownership labels into the generated
Appaloft override file, and Docker Swarm image service apply plans include matching
`docker service create --mount` flags. Docker Swarm
Compose stack apply plans now render bounded `docker stack deploy` candidate stacks with generated
Appaloft overrides for storage mounts, top-level volume ownership labels, and identity labels when
target service metadata is explicit; an environment-gated real Swarm smoke proves named-volume
creation, route reachability, and scoped cleanup for that path.
Web Resource detail can list available storage volumes, create/rename/delete provider-neutral
storage volume records, show current storage attachments, attach storage to the Resource profile,
detach storage without deleting provider-native volume data, and run the explicit
`storage-volumes.cleanup-runtime` operation through a dry-run-first Resource detail control.
WebView coverage now exercises Resource storage list, provider-neutral create, attach/detach, and
dry-run-first cleanup with destructive confirmation, including guards that the flow does not call
deployment creation or server capacity prune routes.
Explicit provider-native upfront volume provisioning through create is intentionally not part of
v1; deployment execution is the default runtime realization point. The first
`storage-volumes.cleanup-runtime` slice now covers dry-run-first CLI/API/Web dispatch and
conservative local-shell/generic-SSH Docker named-volume inspection/cleanup. Cleanup requires
matching Appaloft ownership labels before a named volume can be matched or removed.
Real cleanup smoke coverage is a GitHub Actions gate with local explicit reproduction scripts:
`bun run smoke:storage-cleanup:docker`, `bun run smoke:storage-cleanup:ssh`, and
`bun run smoke:storage-cleanup`. The local Docker gate creates a real Appaloft-labeled Docker
volume, proves dry-run matched output without deletion, then proves destructive scoped cleanup
removes only that volume. The SSH gate runs the same proof through generic SSH after the shared SSH
preflight.
`.github/workflows/storage-cleanup-e2e.yml` runs the same probes from nightly and release; release
dispatch can set `require_storage_cleanup_e2e=true` to fail closed when the SSH storage-cleanup gate
is required but target secrets are absent.
Cleanup safety now has an application-level and Postgres-backed storage backup safety reader and
runtime blocker for backup retention or in-flight backup/restore evidence. Storage backup/restore
operations are active with provider/source extension ports, durable backup artifact readback,
CLI/API/Web entrypoints, and a local-shell/generic-SSH Docker named-volume provider for
`sqlite-online-backup`/`tar-volume` to `local-filesystem` backup/restore. Live SQLite
`application-consistent` backup is handled by the SQLite-aware source adapter and remains blocked
through the generic tar adapter. Real backup smoke coverage is a GitHub Actions gate with local
explicit reproduction scripts: `bun run smoke:storage-backup:docker`,
`bun run smoke:storage-backup:ssh`, and `bun run smoke:storage-backup`. The local Docker gate
backs up a real Appaloft-labeled Docker volume, stores a local filesystem artifact, restores to a
new Docker named volume, and verifies PocketBase-style SQLite content plus sibling files. The SSH
gate runs the same proof through generic SSH after the shared SSH preflight.
`.github/workflows/storage-backup-e2e.yml` runs the same probes from nightly and release; release
dispatch can set `require_storage_backup_e2e=true` to fail closed when the SSH storage-backup gate
is required but target secrets are absent. Backup command rendering is explicitly scoped to the
runtime provider boundary through a runtime command renderer registry with the current
`posix-shell-docker` renderer, so future Windows, Kubernetes, provider snapshot, or other
platform-specific command families can register different runtime renderer/providers without
changing callers. Concrete offsite target providers, automatic
OS/platform target detection, bind-mount path cleanup policy, and provider-native storage handles
beyond Docker runtime mounts remain governed provider/storage extensions outside the current
provider-neutral create, Docker runtime cleanup, and manual backup/restore baseline.
