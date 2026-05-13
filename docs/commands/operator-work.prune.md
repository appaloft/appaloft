# operator-work.prune Command Spec

## Metadata

- Operation key: `operator-work.prune`
- Command class: `PruneOperatorWorkCommand`
- Input schema: `PruneOperatorWorkCommandInput`
- Handler: `PruneOperatorWorkCommandHandler`
- Use case: `PruneOperatorWorkUseCase`
- Domain / bounded context: Operator Work / process attempt journal
- Current status: active command

## Normative Contract

`operator-work.prune` previews or deletes old terminal durable process attempt journal rows.

Command success means Appaloft has counted matching terminal journal rows and, when `dryRun` is
`false`, deleted only those journal rows. It does not prune runtime artifacts, workspaces, build
cache, remote-state backups, deployment snapshots, audit events, event streams, logs, provider
resources, resource state, deployment state, or compatibility ledger rows aggregated from other read
models.

```ts
type PruneOperatorWorkResult = Result<
  {
    prunedCount: number;
    matchedCount: number;
    dryRun: boolean;
    before: string;
    statuses: Array<"succeeded" | "failed" | "canceled" | "dead-lettered">;
    countsByStatus: Partial<Record<"succeeded" | "failed" | "canceled" | "dead-lettered", number>>;
    prunedAt: string;
  },
  DomainError
>;
```

## Global References

This command inherits:

- [Operator Work Ledger Spec](../specs/010-operator-work-ledger/spec.md)
- [Operator Work Ledger Test Matrix](../testing/operator-work-ledger-test-matrix.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [Adapter Command/Query Boundary](../architecture/adapter-command-query-boundary.md)
- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-028: Command Coordination Scope And Mutation Admission](../decisions/ADR-028-command-coordination-scope-and-mutation-admission.md)
- [ADR-029: Deployment Event Stream And Recovery Boundary](../decisions/ADR-029-deployment-event-stream-and-recovery-boundary.md)

## Purpose

Prune exists for bounded retention of the durable operator work journal after terminal work has aged
past an operator-chosen cutoff. It is a ledger retention command only.

This command is not runtime artifact cleanup, workspace prune, build-cache cleanup, remote-state
prune, audit retention, event retention, retry execution, cancellation, dead-letter, or recovery.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `before` | Required | ISO timestamp cutoff. Only rows with `updatedAt < before` are eligible. |
| `statuses` | Optional | Terminal statuses to prune. Defaults to `succeeded`, `failed`, `canceled`, and `dead-lettered`. |
| `dryRun` | Optional | Defaults to `true`. When true, returns counts without deleting rows. |

The command intentionally has no resource, deployment, server, runtime, provider, audit, log, event,
workspace, or artifact input.

## Admission Flow

The command must:

1. Validate command input.
2. Normalize omitted `dryRun` to `true`.
3. Normalize omitted `statuses` to all prunable terminal statuses.
4. Reject empty status lists or non-prunable statuses at schema validation.
5. Count durable process attempt rows whose status is in the normalized set and whose `updatedAt`
   is older than `before`.
6. If `dryRun` is `true`, return the matched counts without deleting rows.
7. If `dryRun` is `false`, delete only the matched durable process attempt rows and return the
   deleted count and status breakdown.

## Prunable Statuses

Only these statuses are prunable:

- `succeeded`;
- `failed`;
- `canceled`;
- `dead-lettered`.

`pending`, `running`, `retry-scheduled`, and `unknown` are never pruned by this command.

## Rules

- Prune applies only to durable process attempt journal rows.
- Compatibility ledger rows aggregated from deployment, proxy, certificate, remote-state,
  source-link, or route read models are not deleted by this command.
- A dry-run request must not mutate persistence.
- A destructive request must be explicit with `dryRun = false`.
- Matching uses `updatedAt < before`; rows exactly at the cutoff are retained.
- The command returns counts by status so operators can audit the retention effect without reading
  deleted row contents.

## Entrypoints

| Entrypoint | Contract |
| --- | --- |
| CLI | `appaloft work prune --before <iso> [--status <status>] [--dry-run false]` dispatches this command. |
| API/oRPC | `POST /api/operator-work/prune` uses the same command schema. |
| Web | Future operator work UI may call the same command after showing a retention preview. |

## Error Contract

| Code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Input is missing, malformed, or names a non-prunable status. |
| `infra_error` | `process-attempt-persistence` | Conditional | The prune count or delete operation could not be completed. |

## Tests

The governing matrix is [Operator Work Ledger Test Matrix](../testing/operator-work-ledger-test-matrix.md).
At minimum, Code Round coverage must prove:

- dry-run returns eligible counts without deleting rows;
- destructive prune deletes only old terminal durable process attempts;
- pending, running, retry-scheduled, unknown, and cutoff-equal rows are retained;
- CLI and HTTP/oRPC dispatch use the shared command schema.

## Current Implementation Notes And Migration Gaps

This command covers only durable process attempt journal retention. Runtime artifact/workspace
prune, build-cache cleanup, audit/event retention, remote-state stale-lock recovery, migration
execution, and backup restore remain future governed commands.
