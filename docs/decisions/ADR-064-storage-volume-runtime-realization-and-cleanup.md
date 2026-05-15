# ADR-064: Storage Volume Runtime Realization And Cleanup

Status: Accepted

Date: 2026-05-15

## Context

Phase 7 storage volumes are provider-neutral Resource profile records. Deployment snapshots can
already carry immutable mount metadata, and Docker container, Docker Compose, and Docker Swarm
image-service execution can consume that metadata.

The remaining storage gap is not another Resource profile mutation. It is the runtime/provider
lifecycle of concrete Docker volumes, bind-mount directories, Compose volume declarations, Swarm
service mounts, and later provider-native storage handles.

ADR-047 and ADR-050 intentionally exclude Docker volumes from `servers.capacity.prune`. That safety
line must stay intact. Volume cleanup can destroy user data and needs an explicit storage-owned
operation with attachment, snapshot, rollback, backup, and runtime evidence.

## Decision

Storage volume runtime realization remains deployment-driven by default. `storage-volumes.create`
creates only provider-neutral control-plane state; it must not pre-provision provider-native storage
or mutate a runtime target.

When a deployment snapshot includes storage mount metadata, the selected runtime target adapter may
realize the concrete runtime volume as part of deployment execution:

- Docker container and generic-SSH Docker container targets use deterministic `--mount` metadata;
- Docker Compose targets use the generated Appaloft Compose override file;
- Docker Swarm image-service targets use deterministic `docker service create --mount` metadata;
- Docker Swarm Compose stack targets use a generated Appaloft stack override file, deploy one
  candidate stack per deployment, verify the target service, promote route labels only after
  verification, and clean superseded Appaloft-labeled stacks or services.

Docker named-volume realizations created by Appaloft deployment execution must carry Appaloft
ownership labels when the runtime path supports volume labels. The required labels are
`appaloft.managed=true`, `appaloft.storage-volume-id`, `appaloft.storage-volume-kind=named-volume`,
and `appaloft.storage-runtime-realized-by=deployment-execution`. Cleanup must treat missing or
mismatched ownership labels as `ownership-unproven` instead of relying on name conventions alone.

Appaloft introduces an explicit operation key, `storage-volumes.cleanup-runtime`, for runtime
volume cleanup. This operation is storage-volume scoped and deployment-target scoped. It previews or
removes concrete runtime volume realizations only when Appaloft can prove that the realization is
not referenced by active Resource attachments, active runtimes, retained deployment snapshots,
rollback candidates, backup/restore relationships, or provider safety blockers.

The cleanup command must:

- default to dry-run;
- require a `storageVolumeId`, `serverId`, and ISO `before` cutoff;
- delete only candidates with `updatedAt < before`;
- preserve active runtimes, current Resource attachments, retained deployment snapshots, rollback
  candidates, retained backup/restore relationships, and Appaloft state roots;
- never run broad `docker system prune` or Docker's unscoped `volume prune`;
- never delete bind-mount source paths unless a later ADR explicitly accepts path ownership and
  backup safety rules;
- return only bounded provider-neutral diagnostics;
- keep raw shell output, credentials, environment values, host path secrets, private keys, and
  provider payloads out of results and errors;
- record safe operator-work/process visibility when implemented as background target work.

## Consequences

- Provider-native upfront volume provisioning is not part of `storage-volumes.create`; v1 treats
  deployment execution as the realization point.
- Runtime adapters may rely on provider/runtime primitives that create named volumes on first use,
  but they must keep that behavior tied to deployment execution and immutable mount snapshots. For
  Docker run and Compose/Swarm stack paths, Appaloft records ownership through volume labels at the
  same deployment-execution boundary.
- `servers.capacity.prune` continues to exclude Docker volumes. Storage runtime cleanup is a
  separate operation with storage-specific safety evidence.
- `storage-volumes.delete` remains a control-plane delete/tombstone operation. It does not clean up
  runtime volumes.
- Web, CLI, HTTP/API, and future MCP/tool surfaces must not present cleanup as a generic volume
  delete. They must show dry-run preview, blockers, and explicit destructive confirmation before
  destructive cleanup.
- Docker Swarm Compose stack volume behavior is part of deployment execution only; it does not
  authorize `storage-volumes.create`, `storage-volumes.delete`, or `servers.capacity.prune` to run
  `docker stack deploy` or remove storage data.

## Governed Specs

- [Storage Volume Runtime Realization And Cleanup](../specs/070-storage-volume-runtime-realization-and-cleanup/spec.md)
- [Storage Volume Lifecycle Workflow](../workflows/storage-volume-lifecycle.md)
- [Storage Volume Test Matrix](../testing/storage-volume-test-matrix.md)
- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](./ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-023: Runtime Orchestration Target Boundary](./ADR-023-runtime-orchestration-target-boundary.md)
- [ADR-047: Runtime Artifact And Workspace Prune Boundary](./ADR-047-runtime-artifact-workspace-prune-boundary.md)
- [ADR-050: Docker Cache And Image Prune Boundary](./ADR-050-docker-cache-and-image-prune-boundary.md)

## Current Implementation Notes And Future Extensions

- `storage-volumes.cleanup-runtime` is implemented for local-shell and generic-SSH Docker
  named-volume inspection and cleanup. It requires matching Appaloft ownership labels before a
  named volume can match or be removed.
- Docker Swarm Compose stack realization is implemented for explicit target-service metadata
  through bounded `docker stack deploy` commands and Appaloft-generated overrides with top-level
  volume ownership labels. Real target confidence is provided by GitHub Actions/local explicit
  Swarm and storage-cleanup gates instead of default local smoke.
- Provider-native storage handles beyond Docker/Compose/Swarm runtime mounts are future governed
  provider extensions; they are not part of the v1 `storage-volumes.create` provisioning boundary.
- Bind-mount source path cleanup is intentionally blocked until a later accepted decision can prove
  path ownership and backup safety.
