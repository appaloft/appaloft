# storage-volumes.cleanup-runtime Command Spec

## Metadata

- Operation key: `storage-volumes.cleanup-runtime`
- Command class: `CleanupStorageVolumeRuntimeCommand`
- Input schema: `CleanupStorageVolumeRuntimeCommandInput`
- Handler: `CleanupStorageVolumeRuntimeCommandHandler`
- Use case: `CleanupStorageVolumeRuntimeUseCase`
- Domain / bounded context: Workload Delivery / runtime target adapter boundary
- Current status: implemented for local-shell and generic-SSH Docker named-volume inspection and
  cleanup

## Normative Contract

`storage-volumes.cleanup-runtime` previews or removes concrete runtime volume realizations for one
StorageVolume on one deployment target/server.

Command success means Appaloft has inspected the target for volume realizations that can be proven
to belong to the selected StorageVolume and, when `dryRun` is `false`, removed only candidates whose
ownership, cutoff, active attachment, active runtime, snapshot, rollback, backup, and provider
safety evidence passed.

It is not `storage-volumes.delete`, not `servers.capacity.prune`, not Docker `volume prune`, and
not a broad provider cleanup operation.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `storageVolumeId` | Required | StorageVolume whose runtime realizations should be inspected. |
| `serverId` | Required | Deployment target/server whose runtime target should be inspected. |
| `before` | Required | ISO timestamp cutoff. Only candidates with `updatedAt < before` are eligible. |
| `dryRun` | Optional | Defaults to `true`. Destructive cleanup requires explicit `false`. |

## Admission Flow

The command must:

1. Validate command input.
2. Normalize omitted `dryRun` to `true`.
3. Load the StorageVolume and target/server by id.
4. Read attachment, snapshot, rollback, backup, and provider safety evidence.
5. Ask the runtime target storage cleanup port to inspect and optionally remove candidates.
6. Return bounded diagnostic facts including matched, skipped, blocked, and cleaned counts.

## Safety Rules

- Dry-run must not mutate the target.
- Destructive cleanup requires explicit `dryRun = false`.
- Matching uses `updatedAt < before`; cutoff-equal candidates are retained.
- Active Resource attachments are blockers.
- Active runtimes are blockers.
- Retained deployment snapshots and rollback candidates are blockers.
- Backup/restore relationships and in-flight backup/restore work are blockers.
- Bind-mount source paths are never deleted in this slice.
- The runtime adapter must never run broad `docker system prune` or unscoped `docker volume prune`.
- `storage-volumes.delete` must not call this command implicitly.
- `servers.capacity.prune` must not call this command or delete storage volumes.
- Results and errors must not include raw shell output, credentials, environment values, secret
  paths, private keys, provider tokens, or provider payloads.

## Entrypoints

| Entrypoint | Contract |
| --- | --- |
| CLI | `appaloft storage volume cleanup-runtime <storageVolumeId> --server <serverId> --before <iso> [--dry-run false]`. |
| API/oRPC | `POST /api/storage-volumes/{storageVolumeId}/runtime-cleanup` using this command schema. |
| Web | Resource detail Storage calls the same command after dry-run preview and destructive confirmation. |

## Error Contract

| Code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Input is missing or malformed. |
| `not_found` | `storage-volume-read` or `server-read` | No | StorageVolume or server does not exist or is not visible. |
| `storage_volume_cleanup_blocked` | `storage-runtime-cleanup-admission` | No | Attachment, runtime, snapshot, rollback, backup, or provider safety evidence blocks cleanup. |
| `runtime_target_unsupported` | `storage-runtime-cleanup` | No | The target cannot inspect or clean storage runtime realizations through this command. |
| `infra_error` | `storage-runtime-cleanup` | Conditional | Target inspection or deletion could not be completed safely. |

## Tests

The governing matrix is [Storage Volume Test Matrix](../testing/storage-volume-test-matrix.md).
At minimum, Code Round coverage must prove:

- dry-run returns candidates/blockers and deletes nothing by default;
- destructive cleanup deletes only matched safe candidates;
- active attachments, active runtimes, retained snapshots, rollback candidates, backup/restore
  blockers, and provider blockers prevent cleanup;
- bind-mount source paths are not deleted;
- CLI and HTTP/oRPC dispatch use the shared command schema.

## Current Implementation Notes And Governed Follow-Ups

The first implementation adds the command, handler, operation catalog row, CLI command, HTTP/oRPC
route, Resource detail Web controls, shared contracts, application safety evidence gathering, audit
recording for destructive cleanup, and a conservative runtime adapter for local-shell and
generic-SSH Docker named volumes. The runtime script inspects only the deterministic
Appaloft-owned Docker volume name for the selected StorageVolume, blocks active containers and
active attachment, retained deployment snapshot, rollback-candidate, backup-retention, or in-flight
backup/restore safety evidence, defaults CLI/API/Web preview requests to dry-run, and never runs
broad Docker prune commands. The default unsupported provider composition reports no in-flight
storage backup/restore work unless a concrete storage backup provider registers safety evidence;
storage backup/restore adapters must feed the same safety reader.

Remaining governed extensions: concrete storage backup provider smoke evidence, provider-native
storage handles beyond Docker runtime mounts, and bind-mount source path cleanup policy. GitHub Actions/local
explicit Swarm and storage-cleanup gates provide real target confidence without making
target-mutating proofs default local checks. Swarm Compose stack realization and superseded
stack/service cleanup happen during deployment execution, not through this command.
