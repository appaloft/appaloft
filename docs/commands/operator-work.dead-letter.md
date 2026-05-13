# operator-work.dead-letter Command Spec

## Metadata

- Operation key: `operator-work.dead-letter`
- Command class: `DeadLetterOperatorWorkCommand`
- Input schema: `DeadLetterOperatorWorkCommandInput`
- Handler: `DeadLetterOperatorWorkCommandHandler`
- Use case: `DeadLetterOperatorWorkUseCase`
- Domain / bounded context: Operator Work / process attempt journal
- Current status: active command

## Normative Contract

`operator-work.dead-letter` records that one durable process attempt must stop automatic retry
selection and remain visible for later manual review.

Command success means the selected durable process attempt journal row is updated to terminal
`dead-lettered` with safe operator rationale. It does not retry work, cancel running work, mark
work recovered, prune artifacts, recover remote state, mutate deployment/resource/server/runtime
aggregate state, or erase historical audit/event records.

```ts
type DeadLetterOperatorWorkResult = Result<
  {
    workId: string;
    status: "dead-lettered";
    deadLetteredAt: string;
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

Dead-lettering exists for failed or retry-scheduled process attempts that should no longer be
picked up by retry candidates until a later explicit operator action. It gives support operators a
durable terminal state for work that is known unsafe, repeatedly failing, or waiting on external
repair.

This command is not a workflow cancel, retry, prune, rollback, or recovery command.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `workId` | Required | Durable process attempt id to dead-letter. |
| `reason` | Required | Safe operator-provided dead-letter rationale. It must not contain secrets. |

The command intentionally has no resource, deployment, server, runtime, or provider action input.

## Admission Flow

The command must:

1. Validate command input.
2. Load the durable process attempt by `workId` from the process attempt read model.
3. Reject missing rows with `operator_work_not_found`.
4. Reject rows whose status is not dead-letterable.
5. Persist the same process attempt identity with:
   - `status = "dead-lettered"`;
   - `phase = "manual-dead-letter"`;
   - `step = "dead-lettered"`;
   - `finishedAt = clock.now()`;
   - `updatedAt = clock.now()`;
   - `retriable = false`;
   - no retry eligibility;
   - `nextActions = ["manual-review"]`;
   - safe details containing `deadLettered = true`, `deadLetteredAt`, and `deadLetterReason`.
6. Return the updated work id, status, and dead-letter timestamp.

## Dead-Letterable Statuses

Only these statuses are dead-letterable:

- `failed`;
- `retry-scheduled`.

`pending`, `running`, `succeeded`, `canceled`, `dead-lettered`, and `unknown` are rejected with
`operator_work_dead_letter_not_allowed`.

## Rules

- Dead-letter applies only to durable process attempt rows. Compatibility ledger rows aggregated
  from deployment, proxy, certificate, remote-state, source-link, or route read models are read-only
  until they are recorded in the durable process attempt journal.
- The command must clear retry eligibility so due retry candidate readers no longer select the row.
- The command must preserve safe related ids and safe details that help explain the original work,
  but it must not preserve stale retry fields or expose raw secret-bearing details.
- The command must not create a new attempt id. It is a ledger terminal annotation on the selected
  attempt, not a retry.
- Retry, cancel, mark-recovered, and prune remain separate lifecycle commands.

## Entrypoints

| Entrypoint | Contract |
| --- | --- |
| CLI | `appaloft work dead-letter <workId> --reason <text>` dispatches this command. |
| API/oRPC | `POST /api/operator-work/{workId}/dead-letter` uses the same command schema. |
| Web | Future operator work UI may call the same command after showing the selected failed or retry-scheduled row. |

## Error Contract

| Code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Input is missing or malformed. |
| `operator_work_not_found` | `operator-work-dead-letter` | No | No durable process attempt exists for `workId`. |
| `operator_work_dead_letter_not_allowed` | `operator-work-dead-letter` | No | The row status is not dead-letterable by this command. |
| `infra_error` | `process-attempt-persistence` | Conditional | The updated process attempt row could not be persisted. |

## Tests

The governing matrix is [Operator Work Ledger Test Matrix](../testing/operator-work-ledger-test-matrix.md).
At minimum, Code Round coverage must prove:

- a failed or retry-scheduled durable process attempt can be dead-lettered;
- retry fields are cleared and next actions become `manual-review`;
- non-dead-letterable statuses reject without mutation;
- missing durable rows reject with `operator_work_not_found`;
- CLI and HTTP/oRPC dispatch use the shared command schema.

## Current Implementation Notes And Migration Gaps

This command is the second operator work lifecycle mutation. It covers only manual dead-letter
annotation for durable process attempt rows. Automated retry execution, cancel, prune, runtime
artifact/workspace prune, remote-state stale-lock recovery, migration execution, and backup restore
remain future governed commands.
