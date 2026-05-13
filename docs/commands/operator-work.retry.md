# operator-work.retry Command Spec

## Metadata

- Operation key: `operator-work.retry`
- Command class: `RetryOperatorWorkCommand`
- Input schema: `RetryOperatorWorkCommandInput`
- Handler: `RetryOperatorWorkCommandHandler`
- Use case: `RetryOperatorWorkUseCase`
- Domain / bounded context: Operator Work / process attempt journal
- Current status: active command

## Normative Contract

`operator-work.retry` records a new durable retry attempt for one failed or retry-scheduled process
attempt that explicitly remains retriable.

Command success means Appaloft has created a new `pending` process attempt journal row with a fresh
attempt id and safe retry lineage. It does not execute runtime/provider work, replay old events,
rollback deployments, recover remote state, prune artifacts, mutate deployment/resource/server/
runtime aggregate state, or erase the original attempt.

```ts
type RetryOperatorWorkResult = Result<
  {
    workId: string;
    status: "pending";
    retryOfWorkId: string;
    retriedAt: string;
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

Retry exists for durable process attempts where the original workflow recorded a retryable failure
or scheduled retry but no operation-specific retry runner has taken ownership yet. It gives
operators a safe way to unblock support triage by creating the next attempt record without
pretending that runtime/provider execution has already happened.

This command is not an automated retry worker, deployment retry, workflow replay, dead-letter,
cancel, mark-recovered, or prune command.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `workId` | Required | Durable failed or retry-scheduled process attempt id to retry from. |
| `reason` | Optional | Safe operator-provided retry rationale. It must not contain secrets. |

The command intentionally has no resource, deployment, server, runtime, or provider action input.

## Admission Flow

The command must:

1. Validate command input.
2. Load the durable process attempt by `workId` from the process attempt read model.
3. Reject missing rows with `operator_work_not_found`.
4. Reject rows whose status or retry metadata is not retryable.
5. Allocate a fresh process attempt id through the injected `IdGenerator`.
6. Persist a new process attempt row with:
   - `status = "pending"`;
   - `phase = "manual-retry"`;
   - `step = "queued"`;
   - `startedAt = clock.now()`;
   - `updatedAt = clock.now()`;
   - no `finishedAt`;
   - no error code/category;
   - `retriable = false`;
   - no retry eligibility;
   - `nextActions = ["no-action"]`;
   - the same operation key, correlation id, request id, and safe related ids when present;
   - a retry-specific dedupe key when the original had one, with the original dedupe key preserved
     in safe lineage;
   - safe details containing `retryOfWorkId`, `retriedAt`, and optional `retryReason`.
7. Return the new work id, `pending` status, original work id, and retried timestamp.

## Retryable Statuses

Only these statuses are retryable:

- `failed`;
- `retry-scheduled`.

The selected row must also have `retriable = true`.

`pending`, `running`, `succeeded`, `canceled`, `dead-lettered`, `unknown`, and failed rows without
`retriable = true` are rejected with `operator_work_retry_not_allowed`.

## Rules

- Retry applies only to durable process attempt rows. Compatibility ledger rows aggregated from
  deployment, proxy, certificate, remote-state, source-link, or route read models are read-only
  until they are recorded in the durable process attempt journal.
- Retry must create a new attempt id. It must not overwrite the original attempt.
- Retry must preserve safe lineage so the new attempt can be traced back to the original work id.
- Retry must preserve the original dedupe key as safe lineage and use a retry-specific dedupe key
  for the new attempt because the process attempt journal treats dedupe keys as unique ownership
  keys. The original attempt's retry eligibility must be cleared when the retry row is recorded so
  stale scheduled retries stop being selected.
- Retry must not copy stale `nextEligibleAt`, terminal `finishedAt`, or previous error fields into
  the new attempt.
- Operation-specific execution remains a separate process-manager or worker concern. This command
  creates durable retry intent only.

## Entrypoints

| Entrypoint | Contract |
| --- | --- |
| CLI | `appaloft work retry <workId> [--reason <text>]` dispatches this command. |
| API/oRPC | `POST /api/operator-work/{workId}/retry` uses the same command schema. |
| Web | Future operator work UI may call the same command after showing the selected failed or retry-scheduled row. |

## Error Contract

| Code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Input is missing or malformed. |
| `operator_work_not_found` | `operator-work-retry` | No | No durable process attempt exists for `workId`. |
| `operator_work_retry_not_allowed` | `operator-work-retry` | No | The row is not retryable by this command. |
| `infra_error` | `process-attempt-persistence` | Conditional | The retry attempt row could not be persisted. |

## Tests

The governing matrix is [Operator Work Ledger Test Matrix](../testing/operator-work-ledger-test-matrix.md).
At minimum, Code Round coverage must prove:

- a failed or retry-scheduled durable process attempt with `retriable = true` creates a new pending
  retry attempt;
- the new retry attempt has a new id, safe lineage, preserved related ids, no stale retry timing,
  no previous error fields, and `nextActions = ["no-action"]`;
- non-retryable statuses and failed rows without `retriable = true` reject without mutation;
- missing durable rows reject with `operator_work_not_found`;
- CLI and HTTP/oRPC dispatch use the shared command schema.

## Current Implementation Notes And Migration Gaps

This command covers only creation of the durable retry attempt row. Automated retry execution,
operation-specific retry runners, runtime/provider cancellation, prune, runtime artifact/workspace
prune, remote-state stale-lock recovery, migration execution, and backup restore remain future
governed commands.
