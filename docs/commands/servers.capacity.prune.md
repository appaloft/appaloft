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

| Field | Requirement | Meaning |
| --- | --- | --- |
| `serverId` | Required | Deployment target/server whose runtime target capacity should be pruned. |
| `before` | Required | ISO timestamp cutoff. Only candidates with `updatedAt < before` are eligible. |
| `categories` | Optional | Defaults to `stopped-containers`, `preview-workspaces`, and `source-workspaces`; `docker-build-cache`, `unused-images`, and `remote-state-markers` require explicit opt-in. |
| `target` | Optional | Exact candidate id or target filter. When present, dry-run and destructive prune report or mutate only candidates whose `id` or `target` exactly matches this value. |
| `dryRun` | Optional | Defaults to `true`. When true, returns candidates without deleting target artifacts. |

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
   rollback-candidate deployment id protection sets. Resolve Resource lifecycle for current-runtime
   owners so a Resource whose archive completed its required runtime stop no longer protects that
   stopped current runtime. If either view is incomplete or changes while it is being read, fail
   closed before asking a runtime adapter to mutate anything.
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
- Destructive prune requires explicit `dryRun = false`.
- Matching uses `updatedAt < before`; cutoff-equal candidates are retained.
- Active runtimes are always skipped.
- A terminal deployment remains the current-runtime owner while its Resource is active. After
  Resource archive durably completes its required runtime stop, that deployment no longer receives
  active-runtime-owner protection; explicit rollback-candidate protection remains unchanged.
- Rollback candidates and unknown rollback-safety candidates are always skipped.
- A stopped container is eligible only when Appaloft ownership labels identify both its deployment
  and resource, and its deployment id is absent from the application-derived active-runtime and
  rollback-candidate protection sets. Missing labels or incomplete deployment evidence fail closed.
- Docker volumes and Appaloft state roots are excluded by default and must not be deleted.
- `docker-build-cache` and `unused-images` must be explicitly selected and must use Docker filtered
  prune commands with `until=<before>`.
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
  older remaining archives.
- The adapter must never run broad `docker system prune`.
- Unused image pruning must rely on Docker image prune safety rather than direct image id, tag, or
  digest removal.
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

## Entrypoints

| Entrypoint | Contract |
| --- | --- |
| CLI | `appaloft server capacity prune <serverId> --before <iso> [--category <category>] [--target <id-or-target>] [--dry-run false]` dispatches this command. |
| API/oRPC | `POST /api/servers/{serverId}/capacity/prune` uses the same command schema. |
| Web | Server detail Capacity calls the same command after showing a dry-run-first prune surface. The Monitor handoff may prefill `before` from the observation window, but Web still dispatches an explicit dry-run preview before any destructive action. |

## Error Contract

| Code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Input is missing, malformed, or names an unsupported category. |
| `not_found` | `server-read` | No | The deployment target/server does not exist or is not visible. |
| `runtime_target_unsupported` | `runtime-target-capacity-prune` | No | The selected target provider cannot prune runtime capacity through this command. |
| `infra_error` | `runtime-target-capacity-prune` | Conditional | Target inspection or deletion could not be completed safely. |
| `infra_error` | `runtime-target-capacity-prune-audit` | Conditional | Audit recording failed after runtime deletion; surfaced as a result warning, not a command error. |

## Tests

The governing matrix is [Runtime Target Capacity Test Matrix](../testing/runtime-target-capacity-test-matrix.md).
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
- unsupported target providers return `runtime_target_unsupported` before runtime mutation;
- CLI and HTTP/oRPC dispatch use the shared command schema.
- remote-state marker cleanup is opt-in, dry-run-first, and preserves the state root and live
  `ssh-pglite` data.
- large marker dry-runs return bounded candidate details plus summary counts and estimated
  reclaimable bytes.

## Current Implementation Notes And Governed Follow-Ups

The implementation covers local-shell and generic-SSH target adapters for stopped Appaloft-managed
containers, materialized workspace candidates, explicit Docker build-cache prune, explicit
unused-image prune, explicit remote-state marker prune, CLI, HTTP/oRPC, and server Web
dry-run-first dispatch. Docker volume prune, live remote-state repair/restore, event-stream/outbox
publication, and broad retention automation remain future governed slices.
