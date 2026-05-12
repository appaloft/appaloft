# operator-work.mark-recovered Command Spec

## Metadata

- Operation key: `operator-work.mark-recovered`
- Command class: `MarkOperatorWorkRecoveredCommand`
- Input schema: `MarkOperatorWorkRecoveredCommandInput`
- Handler: `MarkOperatorWorkRecoveredCommandHandler`
- Use case: `MarkOperatorWorkRecoveredUseCase`
- Domain / bounded context: Operator Work / process attempt journal
- Current status: active command

## Normative Contract

`operator-work.mark-recovered` records that an operator has manually resolved one durable process
attempt that was blocking diagnosis, retry scheduling, or support triage.

Command success means the selected durable process attempt journal row is updated to terminal
`succeeded` with safe recovery metadata. It does not retry work, cancel work, dead-letter work,
prune artifacts, recover remote state, mutate deployment/resource/server/runtime aggregate state,
or erase historical audit/event records.

```ts
type MarkOperatorWorkRecoveredResult = Result<
  {
    workId: string;
    status: "succeeded";
    recoveredAt: string;
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

Some process attempts are resolved outside Appaloft, for example after an operator fixes a target
host, repairs an external dependency, or confirms that a failed internal maintenance attempt no
longer needs automated retry.

This command gives operators a narrow repair mutation for the process-attempt ledger itself. It is
not a workflow retry or rollback command.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `workId` | Required | Durable process attempt id to mark recovered. |
| `reason` | Optional | Safe operator-provided recovery note. It must not contain secrets. |

The command intentionally has no resource, deployment, server, runtime, or provider action input.

## Admission Flow

The command must:

1. Validate command input.
2. Load the durable process attempt by `workId` from the process attempt read model.
3. Reject missing rows with `operator_work_not_found`.
4. Reject rows whose status is not recoverable.
5. Persist the same process attempt identity with:
   - `status = "succeeded"`;
   - `phase = "manual-recovery"`;
   - `step = "marked-recovered"`;
   - `finishedAt = clock.now()`;
   - `updatedAt = clock.now()`;
   - `retriable = false`;
   - no retry eligibility;
   - `nextActions = ["no-action"]`;
   - safe details containing `recovered = true`, `recoveredAt`, and optional `recoveredReason`.
6. Return the updated work id, status, and recovered timestamp.

## Recoverable Statuses

Only these statuses are recoverable:

- `failed`;
- `retry-scheduled`;
- `dead-lettered`.

`pending`, `running`, `succeeded`, `canceled`, and `unknown` are rejected with
`operator_work_recovery_not_allowed`.

## Rules

- Mark-recovered applies only to durable process attempt rows. Compatibility ledger rows aggregated
  from deployment, proxy, certificate, remote-state, source-link, or route read models are read-only
  until they are recorded in the durable process attempt journal.
- The command must clear retry eligibility and automated retry guidance for the row.
- The command must preserve safe related ids and safe details that help explain the original work,
  but it must not preserve stale retry fields or expose raw secret-bearing details.
- The command must not create a new attempt id. It is a ledger repair annotation on the selected
  attempt, not a retry.
- Retry, cancel, dead-letter, and prune remain separate future lifecycle commands.

## Entrypoints

| Entrypoint | Contract |
| --- | --- |
| CLI | `appaloft work mark-recovered <workId> [--reason <text>]` dispatches this command. |
| API/oRPC | `POST /api/operator-work/{workId}/mark-recovered` uses the same command schema. |
| Web | Future operator work UI may call the same command after showing the selected failed or retry-scheduled row. |

## Error Contract

| Code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Input is missing or malformed. |
| `operator_work_not_found` | `operator-work-recovery` | No | No durable process attempt exists for `workId`. |
| `operator_work_recovery_not_allowed` | `operator-work-recovery` | No | The row status is not recoverable by this command. |
| `infra_error` | `process-attempt-persistence` | Conditional | The updated process attempt row could not be persisted. |

## Tests

The governing matrix is [Operator Work Ledger Test Matrix](../testing/operator-work-ledger-test-matrix.md).
At minimum, Code Round coverage must prove:

- a failed, retry-scheduled, or dead-lettered durable process attempt can be marked recovered;
- retry fields are cleared and next actions become `no-action`;
- non-recoverable statuses reject without mutation;
- missing durable rows reject with `operator_work_not_found`;
- CLI and HTTP/oRPC dispatch use the shared command schema.

## Current Implementation Notes And Migration Gaps

This command is the first operator work lifecycle mutation. It covers only manual recovery
annotation for durable process attempt rows. Automated retry execution, cancel, dead-letter, prune,
runtime artifact/workspace prune, remote-state stale-lock recovery, migration execution, and backup
restore remain future governed commands.
