# Runtime Artifact And Workspace Prune

## Status

- Round: Code Round plus Post-Implementation Sync
- Artifact state: implemented

## Business Outcome

Operators can safely preview and execute bounded runtime target cleanup when a deployment target is
under disk or inode pressure, without risking active workloads, rollback candidates, Docker volumes,
or Appaloft control-plane state.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Runtime artifact prune | Target maintenance that removes eligible Appaloft-managed runtime artifacts. | DeploymentTarget runtime observation | cleanup |
| Materialized source workspace | A deployment-scoped local or SSH source directory created under the runtime source workspace root. | Runtime target adapter | workspace |
| Prune candidate | A target-owned artifact or workspace that may be deleted when cutoff and safety evidence pass. | Runtime target capacity | reclaimable item |
| Active runtime | A currently running or otherwise serving runtime instance for a resource. | Runtime target execution | workload |
| Rollback candidate | A retained successful deployment artifact/workspace that may be needed by rollback readiness. | Deployment recovery | retained artifact |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| RT-CAP-PRUNE-001 | Dry-run by default | a target has eligible stopped-container or workspace candidates | `servers.capacity.prune` omits `dryRun` | Appaloft returns matched/skipped diagnostics and deletes nothing. |
| RT-CAP-PRUNE-002 | Destructive prune requires explicit opt-in | candidates are older than `before` and safety evidence passes | `dryRun` is `false` | only matched candidates in selected categories are deleted and reported. |
| RT-CAP-PRUNE-003 | Preserve active runtime and rollback candidates | target artifacts include active runtime or rollback-retained evidence | prune runs | those candidates are skipped with stable reason codes. |
| RT-CAP-PRUNE-004 | Exclude volumes and state roots | Docker volumes or Appaloft state roots exist | prune runs | the command does not delete them and reports exclusions when discovered. |
| RT-CAP-PRUNE-005 | Entrypoints share schema | CLI or HTTP/oRPC invokes prune | inputs are parsed | both dispatch `PruneServerCapacityCommand` through the command bus. |
| RT-CAP-PRUNE-006 | Destructive prune audit output | destructive prune removes one or more candidates | command completes | one aggregate-scoped audit row is recorded with safe counts/categories only; audit recorder failure is returned as a sanitized warning. |
| RT-CAP-PRUNE-007 | Explicit Docker cache/image prune | target Docker build cache or unused images are older than `before` | prune runs with `docker-build-cache` or `unused-images` selected | Appaloft dry-runs or prunes only those selected categories through Docker filtered prune commands, keeps them out of the default category set, and never prunes volumes or Appaloft state roots. |
| RT-CAP-PRUNE-010 | Explicit remote-state marker prune | old SSH remote-state journals, backups, recovery markers, or recovered-lock archives exist under fixed state-root subdirectories | prune runs with `remote-state-markers` selected | Appaloft dry-runs or prunes only those marker/archive paths, keeps the category out of the default category set, and never prunes the state root, live lock, or live PGlite state. |
| RT-CAP-PRUNE-011 | Bounded large marker dry-run | many old SSH remote-state marker candidates exist | dry-run runs with `remote-state-markers` selected | candidate details are output-limited, summary counts remain complete, and dry-run reports estimated reclaimable bytes. |
| RT-CAP-REMOTE-STATE-001 | SSH PGlite sync backup recovery window | upload safety backups exist under `state/backups/sync-*` | remote PGlite sync upload succeeds or marker prune later runs | sync backups are retained within the configured recovery window and bounded by the configured max-count cap; live `pglite`, `locks`, `source-links`, `server-applied-routes`, and `sync-revision.txt` are never deleted by retention. |
| RT-CAP-REMOTE-STATE-002 | Standalone SSH PGlite live state preservation | standalone `ssh-pglite` state exists with live PGlite, source links, routes, revision, and backend marker | explicit remote-state marker prune runs | old marker archives may be deleted, but live authoritative standalone state remains intact. |

## Domain Ownership

- Bounded context: Deployment Target / runtime target observation.
- Aggregate/resource owner: `DeploymentTarget` supplies server identity; runtime target adapter owns
  target-specific artifact evidence and deletion.
- Upstream/downstream contexts: Deployment recovery readiness supplies rollback-candidate safety
  requirements; runtime target adapters supply local/SSH evidence.

## Public Surfaces

- API: `POST /api/servers/{serverId}/capacity/prune`.
- CLI: `appaloft server capacity prune <serverId> --before <iso> [--category <category>] [--dry-run false]`.
- Web/UI: Server detail Capacity controls call the same command after a dry-run-first preview.
  Monitor observation links may prefill the cutoff from the selected observation window. Destructive
  Web cleanup requires explicit confirmation and sends `dryRun = false`.
- Config: none.
- Events/audit: destructive prune with actual deletions records one aggregate-scoped audit row; no
  domain event stream or outbox publication is added in this slice.
- Public docs/help: `diagnostics.runtime-target-capacity`.

## Non-Goals

- Docker volume prune.
- Appaloft state-root, live remote-state, audit/event, log, route, deployment snapshot, resource,
  server, dependency, or storage-volume retention.
- Docker volume prune or broad `docker system prune`.
- Changing deployment admission, rollback readiness, or resource runtime controls.

## Follow-On Scheduling

Scheduled runtime prune automation is governed by ADR-055 and
`docs/specs/061-scheduled-runtime-prune-automation`. Manual `servers.capacity.prune` remains the
only public one-off prune execution command; scheduled runtime prune policy configuration,
durable scheduled process admission, worker handoff, retry/failure visibility, and focused
automation tests are implemented through the scheduled runtime prune policy and operator-work
surfaces.
