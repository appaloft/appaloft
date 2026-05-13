# operator-work.cancel Command Spec

## Metadata

- Operation key: `operator-work.cancel`
- Command class: `CancelOperatorWorkCommand`
- Input schema: `CancelOperatorWorkCommandInput`
- Handler: `CancelOperatorWorkCommandHandler`
- Use case: `CancelOperatorWorkUseCase`
- Domain / bounded context: Operator Work / process attempt journal
- Current status: active command

## Normative Contract

`operator-work.cancel` records that one durable process attempt should not continue from a pending
or retry-scheduled state.

Command success means the selected durable process attempt journal row is updated to terminal
`canceled` with safe operator rationale. It does not stop already-running runtime work, kill
processes, rollback deployments, prune artifacts, recover remote state, mutate deployment/resource/
server/runtime aggregate state, or erase historical audit/event records.

```ts
type CancelOperatorWorkResult = Result<
  {
    workId: string;
    status: "canceled";
    canceledAt: string;
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

Cancel exists for queued or retry-scheduled process attempts that should no longer be picked up or
continued. It is a ledger-level cancellation of future processing, not a runtime or provider
interrupt.

This command is not a deployment cancel, workflow rollback, process kill, retry, dead-letter, or
prune command.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `workId` | Required | Durable process attempt id to cancel. |
| `reason` | Required | Safe operator-provided cancellation rationale. It must not contain secrets. |

The command intentionally has no resource, deployment, server, runtime, or provider action input.

## Admission Flow

The command must:

1. Validate command input.
2. Load the durable process attempt by `workId` from the process attempt read model.
3. Reject missing rows with `operator_work_not_found`.
4. Reject rows whose status is not cancelable.
5. Persist the same process attempt identity with:
   - `status = "canceled"`;
   - `phase = "manual-cancel"`;
   - `step = "canceled"`;
   - `finishedAt = clock.now()`;
   - `updatedAt = clock.now()`;
   - `retriable = false`;
   - no retry eligibility;
   - `nextActions = ["no-action"]`;
   - safe details containing `canceled = true`, `canceledAt`, and `cancelReason`.
6. Return the updated work id, status, and canceled timestamp.

## Cancelable Statuses

Only these statuses are cancelable:

- `pending`;
- `retry-scheduled`.

`running`, `succeeded`, `failed`, `canceled`, `dead-lettered`, and `unknown` are rejected with
`operator_work_cancel_not_allowed`.

## Rules

- Cancel applies only to durable process attempt rows. Compatibility ledger rows aggregated from
  deployment, proxy, certificate, remote-state, source-link, or route read models are read-only
  until they are recorded in the durable process attempt journal.
- The command must clear retry eligibility so due retry candidate readers no longer select the row.
- The command must preserve safe related ids and safe details that help explain the original work,
  but it must not preserve stale retry fields or expose raw secret-bearing details.
- The command must not create a new attempt id. It is a ledger terminal annotation on the selected
  attempt, not a retry.
- Running work is not cancelable by this command. Future provider/runtime cancellation must be
  governed by a separate workflow command.

## Entrypoints

| Entrypoint | Contract |
| --- | --- |
| CLI | `appaloft work cancel <workId> --reason <text>` dispatches this command. |
| API/oRPC | `POST /api/operator-work/{workId}/cancel` uses the same command schema. |
| Web | Future operator work UI may call the same command after showing the selected pending or retry-scheduled row. |

## Error Contract

| Code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Input is missing or malformed. |
| `operator_work_not_found` | `operator-work-cancel` | No | No durable process attempt exists for `workId`. |
| `operator_work_cancel_not_allowed` | `operator-work-cancel` | No | The row status is not cancelable by this command. |
| `infra_error` | `process-attempt-persistence` | Conditional | The updated process attempt row could not be persisted. |

## Tests

The governing matrix is [Operator Work Ledger Test Matrix](../testing/operator-work-ledger-test-matrix.md).
At minimum, Code Round coverage must prove:

- a pending or retry-scheduled durable process attempt can be canceled;
- retry fields are cleared and next actions become `no-action`;
- running and terminal statuses reject without mutation;
- missing durable rows reject with `operator_work_not_found`;
- CLI and HTTP/oRPC dispatch use the shared command schema.

## Current Implementation Notes And Migration Gaps

This command covers only manual cancellation of future processing for durable process attempt rows.
Runtime/provider cancellation, automated retry execution, prune, runtime artifact/workspace prune,
remote-state stale-lock recovery, migration execution, and backup restore remain future governed
commands.
