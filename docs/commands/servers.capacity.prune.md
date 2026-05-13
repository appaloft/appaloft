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

It does not prune Docker volumes, Appaloft state roots, remote-state backups, migration journals,
deployment snapshots, audit events, event streams, logs, provider resources, resource state,
deployment state, server state, dependency data, storage volumes, routes, or compatibility ledger
rows.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `serverId` | Required | Deployment target/server whose runtime target capacity should be pruned. |
| `before` | Required | ISO timestamp cutoff. Only candidates with `updatedAt < before` are eligible. |
| `categories` | Optional | Defaults to `stopped-containers`, `preview-workspaces`, and `source-workspaces`; `docker-build-cache` and `unused-images` require explicit opt-in. |
| `dryRun` | Optional | Defaults to `true`. When true, returns candidates without deleting target artifacts. |

Allowed categories are:

- `stopped-containers`;
- `preview-workspaces`;
- `source-workspaces`;
- `docker-build-cache`;
- `unused-images`.

Docker build cache and unused images are intentionally absent from the default category set. Docker
volumes remain absent from the command.

## Admission Flow

The command must:

1. Validate command input.
2. Normalize omitted `dryRun` to `true`.
3. Normalize omitted `categories` to all allowed first-slice categories.
4. Load the target/server by id.
5. Reject unsupported runtime target providers through the runtime target pruner with
   `runtime_target_unsupported`.
6. Ask the runtime target pruner to inspect and optionally prune candidates.
7. When `dryRun` is `false` and at least one candidate was pruned, record one audit row scoped to
   the server id.
8. Return bounded diagnostic facts including matched, pruned, skipped, and excluded counts.

## Safety Rules

- Dry-run must not mutate the target.
- Destructive prune requires explicit `dryRun = false`.
- Matching uses `updatedAt < before`; cutoff-equal candidates are retained.
- Active runtimes are always skipped.
- Rollback candidates and unknown rollback-safety candidates are always skipped.
- Docker volumes and Appaloft state roots are excluded by default and must not be deleted.
- `docker-build-cache` and `unused-images` must be explicitly selected and must use Docker filtered
  prune commands with `until=<before>`.
- The adapter must never run broad `docker system prune`.
- Unused image pruning must rely on Docker image prune safety rather than direct image id, tag, or
  digest removal.
- Remote `ssh-pglite` state roots, backups, and migration data are excluded.
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
| CLI | `appaloft server capacity prune <serverId> --before <iso> [--category <category>] [--dry-run false]` dispatches this command. |
| API/oRPC | `POST /api/servers/{serverId}/capacity/prune` uses the same command schema. |
| Web | Future operator maintenance UI may call the same command after showing a dry-run preview. |

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
- unsupported target providers return `runtime_target_unsupported` before runtime mutation;
- CLI and HTTP/oRPC dispatch use the shared command schema.

## Current Implementation Notes And Migration Gaps

The first implementation covers local-shell and generic-SSH target adapters for stopped
Appaloft-managed containers, materialized workspace candidates, explicit Docker build-cache prune,
and explicit unused-image prune. Docker volume prune, scheduled prune automation,
event-stream/outbox publication, and broad retention automation remain future governed slices.
