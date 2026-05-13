# audit-events.legal-holds.release Command Spec

## Metadata

- Operation key: `audit-events.legal-holds.release`
- Command class: `ReleaseAuditEventLegalHoldCommand`
- Input schema: `ReleaseAuditEventLegalHoldCommandInput`
- Handler: `ReleaseAuditEventLegalHoldCommandHandler`
- Use case: `ReleaseAuditEventLegalHoldUseCase`
- Domain / bounded context: Operator audit history
- Current status: planned command

## Normative Contract

`audit-events.legal-holds.release` marks one active audit legal hold as released while preserving
the hold record for readback.

Command success means future `audit-events.prune` commands no longer treat that hold as active. It
does not delete audit rows, export payloads, delete the hold history, mutate event streams,
outbox/inbox records, process attempts, logs, snapshots, runtime artifacts, or business state.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `holdId` | Required | Legal hold id to release. |
| `releaseReason` | Required | Human-readable reason for releasing the hold. |
| `releasedBy` | Optional | Safe operator/user id or label for hold readback. |

## Admission Flow

The command must:

1. Validate command input.
2. Load the hold record by id.
3. Reject missing holds with `audit_event_legal_hold_not_found`.
4. Treat already released holds as idempotent success or return the existing released state.
5. Persist release timestamp, release reason, and safe released-by metadata.
6. Return the updated hold detail.

## Rules

- Release does not prune rows. Operators must run `audit-events.prune` separately after release.
- Released holds remain visible through list/show.
- If multiple active holds match a row, releasing one hold does not make the row prune-eligible
  until no active hold matches it.

## Entrypoints

| Entrypoint | Contract |
| --- | --- |
| CLI | `appaloft audit-event legal-hold release <holdId> --reason <reason>` dispatches this command. |
| API/oRPC | `POST /api/audit-events/legal-holds/{holdId}/release` uses the same command schema. |
| Web | Future operator maintenance UI may call the same command after confirmation. |

## Error Contract

| Code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Input is missing or malformed. |
| `audit_event_legal_hold_not_found` | `audit-event-legal-hold` | No | The requested hold does not exist or is not visible. |
| `infra_error` | `audit-event-legal-hold` | Conditional | Hold release persistence could not be completed. |

## Tests

The governing matrix is [Audit Event Read Surface Test Matrix](../testing/audit-event-read-surface-test-matrix.md).
At minimum, Code Round coverage must prove:

- active holds can be released with a reason;
- released holds remain readable;
- prune can delete matching old rows only after all active matching holds are released;
- CLI and HTTP/oRPC dispatch use the shared command schema.

## Current Implementation Notes And Migration Gaps

This command is specified but not implemented.
