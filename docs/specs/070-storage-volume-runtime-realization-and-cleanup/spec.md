# Storage Volume Runtime Realization And Cleanup

## Status

- Round: Code Round / Post-Implementation Sync
- Artifact state: implemented for Docker runtime mount realization with Appaloft ownership labels,
  Swarm Compose stack realization, and dry-run-first local/generic-SSH Docker named-volume cleanup
- Roadmap target: Phase 7 / `0.9.0` beta, Day-Two Production Controls
- Compatibility impact: `pre-1.0-policy`, additive public CLI/API/oRPC/Web capability

## Business Outcome

Operators can trust that Appaloft-managed storage mounts are realized by deployment execution and
that destructive runtime volume cleanup will happen only through an explicit, dry-run-first storage
operation with attachment, snapshot, rollback, backup, and runtime safety evidence.

This closes the ambiguity left by the provider-neutral storage baseline: `storage-volumes.create`
is control-plane state, deployment execution realizes runtime mounts, and runtime cleanup is not a
generic Docker prune.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| RuntimeVolumeRealization | Concrete runtime/provider storage created or referenced from a deployment snapshot mount. | Runtime target adapter | Docker volume, Compose volume, Swarm mount |
| StorageRuntimeCleanup | Explicit dry-run-first operation that removes eligible runtime volume realizations. | StorageVolume / runtime target | volume cleanup |
| VolumeCleanupCandidate | Runtime volume realization that may be deleted when ownership and safety evidence pass. | Runtime target adapter | prune candidate |
| BindMountSourcePath | Trusted runtime boundary path recorded on a bind-mount StorageVolume. | StorageVolume | host path |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| STOR-REALIZE-001 | Deployment-driven realization | A deployment snapshot contains named-volume or bind-mount metadata | Runtime execution starts a Docker container, Compose project, or Swarm image service | The runtime adapter consumes immutable mount metadata and realizes only the selected deployment runtime, adds Appaloft ownership labels to Docker named-volume realizations where the runtime supports volume labels, and does not change `storage-volumes.create` semantics. |
| STOR-REALIZE-002 | No upfront provider provisioning | Operator creates a storage volume record | `storage-volumes.create` succeeds | No runtime target command, provider-native volume create, deployment, runtime restart, or cleanup side effect runs. |
| STOR-REALIZE-003 | Swarm Compose stack realization | A Resource uses Docker Compose, the selected target is Docker Swarm stack mode, and target service metadata is explicit | deployment planning reaches stack realization | Appaloft renders a bounded `docker stack deploy` candidate stack with an Appaloft-generated override for identity labels, runtime env/secret references, storage mounts, and the edge network; it verifies the target service, promotes route labels after verification, and cleans superseded Appaloft-labeled stacks/services without broad Docker prune. |
| STOR-CLEANUP-001 | Dry-run cleanup by default | A runtime target has eligible Appaloft-owned volume realizations older than cutoff | `storage-volumes.cleanup-runtime` omits `dryRun` | Appaloft returns candidate/blocker diagnostics and deletes nothing. |
| STOR-CLEANUP-002 | Destructive cleanup requires explicit confirmation | Eligible candidates pass Appaloft ownership-label, cutoff, attachment, runtime, rollback, snapshot, and backup safety checks | `dryRun = false` | Only safe matched runtime volume realizations are removed and bounded counts are returned; missing or mismatched ownership labels return `ownership-unproven`. |
| STOR-CLEANUP-003 | Preserve live or retained storage | A candidate is referenced by an active Resource attachment, active runtime, retained deployment snapshot, rollback candidate, backup retention, in-flight backup/restore work, or provider safety blocker | cleanup runs | Candidate is skipped with a stable safe blocker reason. |
| STOR-CLEANUP-004 | Exclude bind-mount source path deletion | Candidate refers to a bind-mount source path | cleanup runs | Appaloft never removes the host path; it may report it as unsupported or inspection-only. |
| STOR-CLEANUP-005 | Entrypoints share schema | CLI or HTTP/oRPC invokes cleanup | inputs are parsed | Both dispatch `CleanupStorageVolumeRuntimeCommand` through the command bus using the same schema. |

## Domain Ownership

- Bounded context: Workload Delivery plus runtime target adapter boundary.
- Aggregate/resource owners:
  - `StorageVolume` owns provider-neutral storage identity, backup relationship metadata, and
    control-plane delete safety.
  - `Resource` owns current storage attachments.
  - Deployment snapshots own immutable mount metadata for historical attempts.
  - Runtime target adapters own target-specific realization evidence and deletion mechanics.
- Upstream/downstream contexts:
  - Deployment recovery readiness supplies rollback candidate blockers.
  - Dependency backup/restore and storage backup/restore supply retention blockers.
  - Runtime capacity prune remains separate and must not own storage cleanup.

## Public Surfaces

- API/oRPC: `POST /api/storage-volumes/{storageVolumeId}/runtime-cleanup`.
- CLI: `appaloft storage volume cleanup-runtime <storageVolumeId> --server <serverId> --before <iso> [--dry-run false]`.
- Web/UI: Resource detail Storage exposes a dry-run-first runtime cleanup control for one
  StorageVolume and one server, and only sends destructive cleanup after an explicit confirmation.
- Config: no repository config fields.
- Events/process: implementation may record operator-work/process attempts for target cleanup; no
  domain event stream publication is required in the first Code Round.
- Public docs/help: storage volume docs must explain that provider-neutral delete is not runtime
  cleanup.
- MCP/tools: one explicit cleanup operation descriptor, not a compound "delete storage everywhere" tool.

## Input Model

`storage-volumes.cleanup-runtime` input:

| Field | Requirement | Meaning |
| --- | --- | --- |
| `storageVolumeId` | Required | StorageVolume whose runtime realizations should be inspected. |
| `serverId` | Required | Deployment target/server to inspect. |
| `before` | Required | ISO timestamp cutoff. Only candidates with `updatedAt < before` are eligible. |
| `dryRun` | Optional | Defaults to `true`; destructive cleanup requires explicit `false`. |

## Safety Rules

- `storage-volumes.create/list/show/rename/delete` remain provider-neutral control-plane
  operations.
- `storage-volumes.delete` must not call this cleanup operation implicitly.
- Runtime cleanup must preserve active runtimes and rollback candidates.
- Runtime cleanup must preserve any realization referenced by active Resource attachments or
  retained deployment snapshots.
- Runtime cleanup must preserve retained backup/restore relationships and in-flight storage or
  dependency backup/restore work through explicit safety evidence.
- Runtime cleanup must never run broad `docker system prune` or unscoped `docker volume prune`.
- Runtime cleanup must never delete bind-mount source paths in this slice.
- Results and errors must be redacted and bounded.

## Non-Goals

- No implicit provider-native provisioning during `storage-volumes.create`.
- No implicit Swarm Compose stack rollout outside deployment execution.
- No storage backup/restore execution inside this runtime cleanup command.
- No bind-mount host path deletion.
- No cleanup through `servers.capacity.prune`.
- No deployment admission input changes.

## Current Implementation Notes And Governed Follow-Ups

Deployment-driven runtime realization is implemented for local/generic-SSH Docker containers,
local/generic-SSH Docker Compose override files, Docker Swarm image-service mounts, and Docker
Swarm Compose stack candidate deploys through generated Appaloft stack overrides. An
Appaloft-owned Docker named-volume realization is labeled with `appaloft.managed=true`,
`appaloft.storage-volume-id`, `appaloft.storage-volume-kind=named-volume`, and
`appaloft.storage-runtime-realized-by=deployment-execution` during deployment execution; Compose
and Swarm stack overrides carry the same labels in their top-level volume declarations. Cleanup
requires those labels before a named volume can match or be removed.
Docker Swarm image-service mount flags remain runtime-managed by Docker service scheduling; the
Appaloft intent still records the volume realization evidence, while target-mutating proof stays in
the explicit CI/local smoke layer.
An environment-gated real Swarm smoke proves Compose stack storage mount realization, route
reachability, named-volume creation, and scoped cleanup when `APPALOFT_DOCKER_SWARM_SMOKE=1`.
The explicit `storage-volumes.cleanup-runtime` command is implemented for local-shell and
generic-SSH Docker named-volume inspection/cleanup through CLI, HTTP/oRPC, and Resource detail Web
controls. Docker cleanup now consumes storage backup retention and in-flight backup/restore
evidence through a safety reader; the default unsupported provider composition returns no in-flight
evidence unless a concrete storage backup provider registers it. Provider-native storage handles
beyond Docker runtime mounts, bind-mount path cleanup policy, and concrete storage backup provider
smoke evidence remain governed provider/storage extensions outside the current runtime cleanup
baseline. Real cleanup
smoke commands exist as local explicit reproduction scripts:
`bun run smoke:storage-cleanup:docker`, `bun run smoke:storage-cleanup:ssh`, and
`bun run smoke:storage-cleanup`; they prove dry-run-first and destructive scoped Docker
named-volume cleanup locally or through generic SSH without broad Docker prune.
`.github/workflows/storage-cleanup-e2e.yml` runs those gates from nightly and release; manual
release dispatch can set `require_storage_cleanup_e2e=true` when SSH cleanup evidence is required
instead of locally running the long real target smoke.
