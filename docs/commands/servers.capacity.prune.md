# servers.capacity.prune Command Spec

## Metadata

- Operation key: `servers.capacity.prune`
- Command class: `PruneServerCapacityCommand`
- Input schema: `PruneServerCapacityCommandInput`
- Handler: `PruneServerCapacityCommandHandler`
- Use case: `PruneServerCapacityUseCase`
- Domain / bounded context: DeploymentTarget runtime observation
- Current status: active command

## Normative Contract

`servers.capacity.prune` previews or removes eligible runtime target artifacts and materialized
source workspaces for one deployment target/server.

Command success means Appaloft has inspected the target for selected candidate categories and, when
`dryRun` is `false`, deleted only candidates whose target ownership, cutoff, active-runtime, and
rollback-safety evidence passed.

It does not prune Docker volumes, Appaloft state roots, live remote `ssh-pglite` state, deployment
snapshots, audit events, event streams, logs, provider resources, resource state, deployment state,
server state, dependency data, storage volumes, routes, or compatibility ledger rows. Remote-state
marker cleanup is limited to the explicit `remote-state-markers` category and fixed marker/archive
subdirectories.

## Input Model

| Field        | Requirement | Meaning                                                                                                                                                                     |
| ------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serverId`   | Required    | Deployment target/server whose runtime target capacity should be pruned.                                                                                                    |
| `before`     | Required    | ISO timestamp cutoff. Only candidates with `updatedAt < before` are eligible.                                                                                               |
| `categories` | Optional    | Defaults to `stopped-containers`, `preview-workspaces`, and `source-workspaces`; `docker-build-cache`, `unused-images`, and `remote-state-markers` require explicit opt-in. |
| `target`     | Optional    | Exact candidate id or target filter. When present, dry-run and destructive prune report or mutate only candidates whose `id` or `target` exactly matches this value.        |
| `dryRun`     | Optional    | Defaults to `true`. When true, returns candidates without deleting target artifacts.                                                                                        |

Allowed categories are:

- `stopped-containers`;
- `preview-workspaces`;
- `source-workspaces`;
- `docker-build-cache`;
- `unused-images`;
- `remote-state-markers`.

Docker build cache, unused images, and remote-state markers are intentionally absent from the
default category set. Docker volumes remain absent from the command.

## Admission Flow

The command must:

1. Validate command input.
2. Normalize omitted `dryRun` to `true`.
3. Normalize omitted `categories` to all allowed first-slice categories.
4. Load the target/server by id.
5. Load a complete server-scoped deployment view and derive the in-flight/current-runtime and
   rollback-candidate deployment id protection sets. Resolve active Resources for current-runtime
   owners so an archived or missing Resource no longer protects a historical succeeded runtime.
   In-flight attempts and explicit rollback candidates remain protected. If either view is
   incomplete or changes while it is being read, fail closed before asking a runtime adapter to
   mutate anything.
6. Reject unsupported runtime target providers through the runtime target pruner with
   `runtime_target_unsupported`.
7. Ask the runtime target pruner to inspect and optionally prune candidates, supplying both
   application-derived protection sets.
8. When `dryRun` is `false` and at least one candidate was pruned, record one audit row scoped to
   the server id.
9. Return bounded diagnostic facts including matched, pruned, skipped, excluded, reported,
   omitted, and estimated reclaimable-byte counts.

## Safety Rules

- Dry-run must not mutate the target.
- SSH-PGlite inspect and default/dry-run prune are strict read-only sessions: they may reject an
  active mutation lock, but must not create, heartbeat, recover, or release a lock, upload state,
  increment a revision, open the kernel transition gate, or create a guard, backup, or marker. Their
  streamed snapshot must verify both the
  mutation-lock absence and the state revision before and after archiving, and fail closed if either
  changes.
- Destructive SSH-PGlite sync and remote-state maintenance require `flock` on the target. The
  validated locks-directory descriptor is the transition fencing truth; UUID-owned
  `mutation.guard/owner.json` is a bounded lease/audit residue. Missing kernel support, unsafe guard
  paths, or failure to persist recovery intent fails closed with the filesystem diagnostic before
  moving the canonical mutation lock.
- Destructive prune requires explicit `dryRun = false`.
- Matching uses `updatedAt < before`; cutoff-equal candidates are retained.
- Active runtimes are always skipped.
- A terminal deployment remains the current-runtime owner while its Resource is active. After
  Resource archive durably completes its required runtime stop, or when the Resource no longer
  exists in desired state, that deployment no longer receives active-runtime-owner protection;
  explicit rollback-candidate protection remains unchanged.
- Rollback candidates and unknown rollback-safety candidates are always skipped.
- A stopped container is eligible only when Appaloft ownership labels identify both its deployment
  and resource, and its deployment id is absent from the application-derived active-runtime and
  rollback-candidate protection sets. Missing labels or incomplete deployment evidence fail closed.
- Docker volumes and Appaloft state roots are excluded by default and must not be deleted.
- `docker-build-cache` and `unused-images` must be explicitly selected and must use Docker filtered
  prune commands. Image prune receives the absolute `until=<before>` cutoff. Buildx prune receives a
  positive duration derived on the target from that same absolute cutoff because Buildx accepts
  duration selectors rather than RFC3339 timestamps.
- `remote-state-markers` must be explicitly selected and may remove only old files or directories
  under `state/journals/*.json`, `state/backups/*`, `state/recovery/*.json`, and
  `state/locks/recovered/*`.
- Standalone SSH `ssh-pglite` remains supported. Marker cleanup may remove bounded recovery
  archives after the recovery window, but it must not delete live `state/pglite`, `state/locks`,
  `state/source-links`, `state/server-applied-routes`, `state/sync-revision.txt`, or
  `state/backend.json`.
- Large dry-runs must keep returned candidate details bounded while still returning complete
  summary counts and estimated reclaimable bytes.
- `target` is an exact filter, not a prefix, glob, or label selector. It must narrow candidate
  reporting and deletion before summary counts are accumulated.
- Remote PGlite upload safety backups under `state/backups/sync-*` must remain protected by the
  configured recovery window and bounded sync-backup count before explicit marker cleanup can remove
  older remaining archives. Sync-back applies retention before allocating incoming state, reserves
  one backup slot, validates the incoming mirror before live-state rotation, and uses same-filesystem
  renames so a capacity repair does not require live, copied backup, and incoming state at once. It
  publishes an active recovery marker before rotation and commits only by atomically replacing the
  revision fence; ordinary reads fail closed until explicit recovery rolls back or finishes cleanup.
- The adapter must never run broad `docker system prune`.
- Unused image pruning must use `docker image prune --all` so tagged and dangling images share the
  category semantics reported by capacity inspection. Docker's container-reference safety and the
  exact cutoff filter remain authoritative; the adapter must not remove direct image ids, tags, or
  digests.
- Buildx duration conversion must fail closed when the absolute cutoff is invalid, future, or equal
  to the target clock. It must not substitute a default duration or widen the requested window.
- Remote `ssh-pglite` state roots, live lock state, and live PGlite data are excluded.
- The adapter must skip rather than delete when labels, paths, timestamps, active-runtime state, or
  rollback-safety evidence are incomplete.
- Results and errors must not include raw shell output, credentials, environment values, private
  registry details, or secret paths.
- The audit payload must include only safe aggregate-scoped prune facts: operation key, server id,
  cutoff, selected categories, summary counts, and prune timestamp. It must not include candidate
  target paths, raw shell output, credentials, environment values, private registry details, or
  secret paths.
- If audit recording fails after destructive deletion, the command must not retry deletion or report
  the runtime mutation as failed. It returns the prune result with a sanitized warning.
- If destructive SSH-PGlite prune succeeds locally but final authoritative-state upload fails, the
  shell preserves the local audited mirror plus its base snapshot and blocks later downloads. An
  explicit `server capacity inspect ... --retry-pending-state-sync` retries only that
  revision-fenced upload before the read-only inspection is dispatched. If the fence conflicts, it
  merges onto a fresh authoritative snapshot and preserves that merged mirror across another upload
  failure. Pending metadata binds the exact SSH target and remote state root, validates monotonic
  revisions, generated transaction paths, and complete non-symlink PGlite mirrors, and removes
  superseded recovery mirrors. Recovery revalidates that mirror at the archive packing boundary and
  never recreates a missing mirror before upload. The shell persists the marker through a flushed
  temporary file and atomic rename; after marker commit, interrupted uploads preserve the active
  mirror and still release the remote lock. Orphaned transaction directories, marker temp files, or
  an unreadable recovery directory block a new download.
  Destructive prune does not accept the recovery flag and therefore cannot silently replay deletion.

## Entrypoints

| Entrypoint | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI        | `appaloft server capacity prune <serverId> --before <iso> [--category <category>] [--target <id-or-target>] [--dry-run false]` dispatches this command. Automation operating authoritative SSH-PGlite state may additionally provide `--state-backend ssh-pglite`, `--server-host`, `--server-port`, `--server-ssh-username`, `--server-ssh-private-key-file`, and `--remote-runtime-root`; this explicit backend selects local shell execution even when a remote Profile is active. The shell coordinates state download, command execution, audit persistence, and successful mutation sync-back. `server capacity inspect` and dry-run prune accept the same transport options but remain strict read-only sessions. If a previous destructive upload failed after runtime deletion, `server capacity inspect ... --retry-pending-state-sync` explicitly restores the preserved audited mirror before read-only dispatch; prune does not accept that flag. |
| API/oRPC   | `POST /api/servers/{serverId}/capacity/prune` uses the same command schema.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Web        | Server detail Capacity calls the same command after showing a dry-run-first prune surface. The Monitor handoff may prefill `before` from the observation window, but Web still dispatches an explicit dry-run preview before any destructive action.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Error Contract

| Code                         | Phase                                 | Retriable   | Meaning                                                                                           |
| ---------------------------- | ------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------- |
| `validation_error`           | `command-validation`                  | No          | Input is missing, malformed, or names an unsupported category.                                    |
| `not_found`                  | `server-read`                         | No          | The deployment target/server does not exist or is not visible.                                    |
| `runtime_target_unsupported` | `runtime-target-capacity-prune`       | No          | The selected target provider cannot prune runtime capacity through this command.                  |
| `infra_error`                | `runtime-target-capacity-prune`       | Conditional | Target inspection or deletion could not be completed safely.                                      |
| `infra_error`                | `runtime-target-capacity-prune-audit` | Conditional | Audit recording failed after runtime deletion; surfaced as a result warning, not a command error. |

## Tests

The governing matrices are
[Runtime Target Capacity Test Matrix](../testing/runtime-target-capacity-test-matrix.md) and
[Deployment Runtime Ownership Reconciliation Test Matrix](../testing/deployment-runtime-ownership-reconciliation-test-matrix.md).
At minimum, Code Round coverage must prove:

- dry-run returns candidates and deletes nothing by default;
- destructive prune deletes only matched safe candidates;
- destructive prune with pruned candidates records one safe aggregate-scoped audit row;
- dry-run and destructive no-op prune do not write audit rows;
- active runtime, rollback, volume, state-root, and cutoff-equal candidates are skipped or
  excluded;
- the application supplies complete server-scoped active-runtime and rollback-candidate protection
  sets, and the adapter checks them before any stopped-container deletion;
- an archived Resource releases only its stopped current-runtime owner protection and does not
  release in-flight or explicit rollback-candidate protection;
- a missing Resource releases only historical current-runtime-owner protection, so an exact,
  fully labelled orphan-running target can be matched without weakening in-flight or rollback
  fences;
- unsupported target providers return `runtime_target_unsupported` before runtime mutation;
- CLI and HTTP/oRPC dispatch use the shared command schema.
- SSH-PGlite CLI capacity inspection downloads authoritative state read-only, while prune downloads
  authoritative state and synchronizes its command/audit mutation back after success.
- an active remote Profile cannot divert an explicit SSH-PGlite capacity command to HTTP dispatch;
  invalid SSH ports fail closed; failed commands discard rather than upload local state; and a
  failed final destructive upload preserves a revision-fenced, explicitly retryable audited mirror.
- remote-state marker cleanup is opt-in, dry-run-first, and preserves the state root and live
  `ssh-pglite` data.
- large marker dry-runs return bounded candidate details plus summary counts and estimated
  reclaimable bytes.

## Current Implementation Notes And Governed Follow-Ups

The implementation covers local-shell and generic-SSH target adapters for stopped Appaloft-managed
containers, materialized workspace candidates, explicit duration-filtered Docker build-cache prune,
explicit all-unused-image prune, explicit remote-state marker prune, CLI, HTTP/oRPC, and server Web
dry-run-first dispatch. Docker volume prune, live remote-state repair/restore, event-stream/outbox
publication, and broad retention automation remain future governed slices.
