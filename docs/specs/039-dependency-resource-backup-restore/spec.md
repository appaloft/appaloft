# Dependency Resource Backup And Restore

## Status

- Round: Code Round
- Artifact state: implemented with Docker-backed managed Postgres/Redis shell capability and
  hermetic external/fallback capability, safe provider execution context, and shell-local artifact
  materialization
- Roadmap target: Phase 7 / `0.9.0` beta, Day-Two Production Controls
- Compatibility impact: `pre-1.0-policy`, additive dependency resource lifecycle commands and read
  models
- Decision state: governed by ADR-036

## Business Outcome

Operators can create safe backup restore points for dependency resources and restore a selected
restore point back into the same dependency resource without exposing raw database dumps, connection
secrets, provider credentials, or runtime environment values.

This closes the first backup/restore gap in the Phase 7 dependency-resource loop for ready
Postgres and Redis dependency resources with provider capability support. It does not restart
workloads, redeploy Resources, perform deployment rollback, schedule recurring backups, or delete
backup artifacts.
For Docker-backed Appaloft-managed Postgres/Redis, backup and restore execute against the
single-server target encoded by the safe provider resource handle and resolve raw connection values
only through `DependencyResourceSecretStore`.

## Discover Findings

1. Backup/restore belongs to the Dependency Resources bounded context because the protected data is
   provider or external database state represented by `ResourceInstance`.
2. `ResourceBinding` remains only the workload-to-dependency association. Backup/restore must not
   mutate bindings, binding secret rotation metadata, or historical deployment snapshots.
3. Backup command success means accepted, not provider backup completion. Provider completion and
   failure are visible through `DependencyResourceBackup` state, lifecycle events, and safe read
   models.
4. Restore is destructive provider work. The first slice restores in-place to the same dependency
   resource and requires explicit acknowledgement that provider data may be overwritten and that
   runtime workloads are not restarted by Appaloft.
5. Delete safety must fail closed while retained backup restore points exist, while backup/restore
   attempts are in progress, or while provider retention metadata requires preservation.
6. Provider-specific backup APIs remain behind application/provider ports. Core stores only value
   objects and safe provider artifact handles.
7. Docker-backed managed resources use provider artifact handles, not raw dump paths, in read
   models. The shell provider derives the target-local artifact path from the safe handle during
   restore.

## Ubiquitous Language

| Term | Meaning | Context |
| --- | --- | --- |
| DependencyResourceBackup | Durable backup attempt and restore point record for one dependency resource. | Dependency Resources |
| RestorePoint | A ready safe provider artifact handle that can be restored in place to its owning dependency resource. | Dependency Resources |
| BackupAttempt | Durable provider backup execution attempt. | Dependency Resources |
| RestoreAttempt | Durable provider restore execution attempt from a restore point. | Dependency Resources |
| BackupRetention | Safe retention metadata that blocks dependency resource deletion while preservation is required. | Dependency Resources |
| ProviderArtifactHandle | Safe provider identifier for a backup artifact. It is not a secret and is not dump content. | Dependency Resources |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| DEP-RES-BACKUP-001 | Accept backup request | Active ready dependency resource has provider backup capability | `dependency-resources.create-backup` is admitted | A `DependencyResourceBackup` attempt is persisted, the provider receives only safe execution context (`providerResourceHandle`, masked endpoint, and safe `secretRef`), command returns `ok({ id })`, and `dependency-resource-backup-requested` is emitted without leaking secrets. |
| DEP-RES-BACKUP-002 | Mark backup ready | Provider backup succeeds with safe artifact metadata | The backup result is applied | Backup status becomes `ready`, restore point metadata is visible in list/show, delete safety is blocked by retention, and `dependency-resource-backup-completed` is emitted. |
| DEP-RES-BACKUP-003 | Surface backup failure | Provider backup fails after admission | The backup result is applied | Backup status becomes `failed`, sanitized failure code/category/phase are visible, original command remains accepted, and `dependency-resource-backup-failed` is emitted. |
| DEP-RES-BACKUP-004 | Reject backup for unsupported or not-ready resource | Dependency resource is missing, deleted, pending realization, degraded, unsupported, or lacks required secret reference | `dependency-resources.create-backup` is called | Admission returns structured `not_found`, `dependency_resource_backup_blocked`, or `provider_capability_unsupported`; no backup attempt is persisted when admission fails. |
| DEP-RES-BACKUP-005 | List/show safe restore points | Backups exist for one dependency resource | `dependency-resources.list-backups` or `dependency-resources.show-backup` runs | Output includes only safe owner, dependency kind, status, attempt ids, artifact handle, retention, size/checksum when safe, and sanitized failure metadata. |
| DEP-RES-BACKUP-006 | Accept in-place restore | Ready restore point belongs to the target dependency resource and acknowledgements are supplied | `dependency-resources.restore-backup` is admitted | A restore attempt is persisted, the provider receives the safe artifact handle plus current safe execution context (`providerResourceHandle`, masked endpoint, and safe `secretRef`), command returns `ok({ id })`, and `dependency-resource-restore-requested` is emitted without mutating ResourceBindings, snapshots, or runtime state. |
| DEP-RES-BACKUP-007 | Mark restore completed | Provider restore succeeds | The restore result is applied | Restore attempt status becomes `completed`, dependency resource safe restore metadata is refreshed, and `dependency-resource-restore-completed` is emitted. |
| DEP-RES-BACKUP-008 | Surface restore failure | Provider restore fails after admission | The restore result is applied | Restore attempt status becomes `failed`, sanitized failure metadata is visible, original restore command remains accepted, and `dependency-resource-restore-failed` is emitted. |
| DEP-RES-BACKUP-009 | Block unsafe restore | Restore point is missing, failed, deleted, belongs to another dependency resource, target is deleted/degraded, acknowledgements are missing, or provider capability is absent | `dependency-resources.restore-backup` is called | Admission returns structured blocked/not-found/unsupported error and does not start provider restore. |
| DEP-RES-BACKUP-010 | Block delete while backups require retention | Dependency resource has retained ready backup or in-flight backup/restore attempt | `dependency-resources.delete` is called | Delete returns `dependency_resource_delete_blocked`, reports backup blocker metadata, and does not call provider delete. |
| DEP-RES-BACKUP-011 | Backup Docker-backed managed Postgres/Redis | Ready Appaloft-managed Docker-backed Postgres or Redis has a safe provider handle and resolvable connection secret | `dependency-resources.create-backup` is admitted | Shell provider executes `pg_dump` or Redis `SAVE`/`docker cp` on the owning single-server target, returns a safe provider artifact handle, and exposes no raw dump path or secret in read models. |
| DEP-RES-BACKUP-012 | Restore Docker-backed managed Postgres/Redis | Ready restore point belongs to the Docker-backed managed dependency resource and acknowledgements are supplied | `dependency-resources.restore-backup` is admitted | Shell provider resolves the same single-server target from the provider handle and restores the target-local artifact in place without restarting Appaloft workloads or rewriting deployment snapshots. |
| DEP-RES-BACKUP-013 | Entrypoint contract is explicit | CLI/oRPC/HTTP expose backup/restore after Code Round | Operation catalog and transports are inspected | Commands/queries dispatch explicit messages, reuse application schemas, and expose no provider SDK shape, raw dump, or raw secret field. |

## Domain Ownership

- Bounded context: Dependency Resources.
- Aggregate owner: `DependencyResourceBackup` owns backup attempt state, restore point metadata,
  restore attempts, retention metadata, and backup/restore events.
- Related aggregate: `ResourceInstance` owns dependency resource lifecycle, backup eligibility, and
  delete blocker summaries.
- Application owner: backup/restore use cases coordinate dependency resource loading, provider
  capability admission, durable attempt persistence, event publication, and provider execution.
- Provider owner: provider packages implement backup/restore capability through application ports.
  Provider SDK types do not cross into `core`.
- Workload Delivery relationship: `ResourceBinding` is observed for safety/readiness but is not
  mutated by backup/restore.
- Release Orchestration relationship: deployments may observe immutable dependency binding
  references only; backup/restore does not create rollback attempts or rewrite snapshots.

## Public Surfaces

- API/oRPC:
  - `POST /api/dependency-resources/{dependencyResourceId}/backups`
  - `GET /api/dependency-resources/{dependencyResourceId}/backups`
  - `GET /api/dependency-resources/backups/{backupId}`
  - `POST /api/dependency-resources/backups/{backupId}/restore`
- CLI:
  - `appaloft dependency backup create <dependencyResourceId>`
  - `appaloft dependency backup list <dependencyResourceId>`
  - `appaloft dependency backup show <backupId>`
  - `appaloft dependency backup restore <backupId>`
- Web/UI: Resource detail dependency backup/restore controls can create backup restore points,
  list safe restore point summaries, configure scheduled backup policy, and start acknowledged
  in-place restores through the active HTTP/oRPC contracts.
- Events: add provider-safe lifecycle event specs for backup requested/completed/failed and restore
  requested/completed/failed.
- Public docs/help: task-oriented backup/restore coverage is active under
  `/docs/resources/dependencies/#dependency-backup-restore` and the
  `dependency.backup-restore` help topic. CLI and HTTP descriptions for backup create/list/show
  and restore point directly at that stable anchor.
- MCP/tools: generated descriptors use one operation per command/query over the same application schemas.

## Output Contracts

Backup list/show summaries may include:

- backup id, dependency resource id, project id, environment id, dependency kind, provider key;
- backup status, backup attempt id, requested/completed/failed timestamps;
- restore point status and safe provider artifact handle;
- retention status, retention reason, retention expires timestamp when known;
- safe size/checksum metadata when supplied by provider;
- latest restore attempt status and attempt id;
- sanitized failure code/category/phase/message when failed.

Outputs must not include raw dump contents, raw connection URLs, passwords, tokens, auth headers,
cookies, SSH credentials, provider tokens, private keys, sensitive query parameters, provider SDK
response bodies, or command output.

## Failure Semantics

- `validation_error`, phase `dependency-resource-backup-validation` or
  `dependency-resource-restore-validation`
- `not_found`, phase `context-resolution`
- `dependency_resource_backup_blocked`, category `conflict`, phase
  `dependency-resource-backup-admission`, retriable `false`
- `dependency_resource_restore_blocked`, category `conflict`, phase
  `dependency-resource-restore-admission`, retriable `false`
- `provider_capability_unsupported`, category `integration`, phase
  `dependency-resource-backup-admission` or `dependency-resource-restore-admission`, retriable
  `false`
- `provider_error`, category `integration`, phase `dependency-resource-backup` or
  `dependency-resource-restore`, retriable by provider policy
- `dependency_resource_delete_blocked`, category `conflict`, phase
  `dependency-resource-delete-safety`, retriable `false`

Every error detail must be safe and include only stable ids, dependency kind, provider key,
operation, phase, attempt id, blocker code, and sanitized provider failure metadata.

## Non-Goals

- No backup prune/delete command in this slice.
- No cross-resource restore, clone, export, or download.
- No deployment retry, redeploy, or rollback.
- No runtime environment injection, workload restart, or runtime cleanup.
- No provider-native credential rotation.
- No provider SDK types in `core`, contracts, CLI, Web, events, or read models.

## Current Implementation Notes And Governed Follow-Ups

- Code stores the latest restore attempt inside `DependencyResourceBackup` and persists it as safe
  JSON metadata in the backup repository.
- Provider backup/restore execution is synchronous through an injected shell provider port in this
  slice. The shell provider runs native Postgres and Redis backup/restore commands when the
  dependency resource carries a resolvable Appaloft-owned connection secret, stores the native dump
  path only as safe local artifact metadata, and otherwise keeps the existing metadata-only artifact
  path for provider-owned or unresolved references. Restore validates the backup artifact, provider
  key, provider artifact handle, dependency kind, and provider resource handle before replaying
  native Postgres restore, replaying native Redis logical restore, or materializing restore
  metadata. The port receives the safe execution context needed by external provider
  implementations without exposing raw connection values to application read models, events,
  errors, or transport contracts. Provider attempts are mirrored into operator-visible process
  state; automatic backup/restore retry execution remains a separate governed worker slice.
- The shell/test provider implementation supports Appaloft-managed Postgres, Appaloft-managed
  Redis, imported external Postgres/Redis metadata, native Postgres command execution for imported
  Postgres resources with Appaloft-owned connection refs, and native Redis logical command
  execution for imported Redis resources with Appaloft-owned connection refs. Provider-specific
  Redis snapshot substrates remain governed follow-up work for providers that need snapshot-native
  restore semantics beyond the shell logical dump/restore path.
- Scheduled policy is implemented separately as the disabled-by-default scheduled dependency backup
  runner. Backup pruning, export/download, and cross-resource restore remain governed follow-up work.
