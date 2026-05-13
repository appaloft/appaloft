# audit-events.legal-holds.configure Command Spec

## Metadata

- Operation key: `audit-events.legal-holds.configure`
- Command class: `ConfigureAuditEventLegalHoldCommand`
- Input schema: `ConfigureAuditEventLegalHoldCommandInput`
- Handler: `ConfigureAuditEventLegalHoldCommandHandler`
- Use case: `ConfigureAuditEventLegalHoldUseCase`
- Domain / bounded context: Operator audit history
- Current status: planned command

## Normative Contract

`audit-events.legal-holds.configure` records an active legal hold over retained audit rows.

Command success means Appaloft persisted a hold guard record. It does not copy audit rows into an
immutable archive, export payloads, mutate domain event streams, outbox/inbox records,
process-attempt journals, runtime logs, provider job logs, deployment snapshots, remote-state
backups, runtime artifacts, resource/server/deployment state, routes, dependency data, storage
volumes, or compatibility ledger rows.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `reason` | Required | Human-readable support/compliance reason for the hold. |
| `aggregateId` | Required unless global window is supplied | Narrows the hold to one aggregate id. |
| `eventType` | Optional | Narrows the hold to one exact event type. |
| `from` | Required for global-window hold | Includes rows with `createdAt >= from`. |
| `to` | Required for global-window hold | Includes rows with `createdAt < to`. |
| `requestedBy` | Optional | Safe operator/user id or label for audit hold readback. |

## Admission Flow

The command must:

1. Validate command input.
2. Require a non-empty `reason`.
3. Require either `aggregateId` or a valid `from`/`to` window.
4. Reject unbounded global holds without aggregate id.
5. Persist an active hold record with created timestamp and safe scope metadata.
6. Return the hold id, status, scope, reason, and timestamps.

## Rules

- Aggregate holds may omit `from`/`to`.
- Global holds must include both `from` and `to`, and `from < to`.
- `to` is exclusive so hold windows can be chained without overlap.
- Configure does not count, export, copy, or delete audit rows.
- Active holds must be considered by `audit-events.prune` before destructive deletion.

## Entrypoints

| Entrypoint | Contract |
| --- | --- |
| CLI | `appaloft audit-event legal-hold configure --reason <reason> [--aggregate <aggregateId>] [--event-type <eventType>] [--from <iso>] [--to <iso>]` dispatches this command. |
| API/oRPC | `POST /api/audit-events/legal-holds` uses the same command schema. |
| Web | Future operator maintenance UI may call the same command after showing expected held scope. |

## Error Contract

| Code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Input is missing, malformed, or has an invalid time range. |
| `audit_event_legal_hold_scope_required` | `audit-event-legal-hold` | No | Neither aggregate id nor bounded global window was supplied. |
| `infra_error` | `audit-event-legal-hold` | Conditional | Hold persistence could not be completed. |

## Tests

The governing matrix is [Audit Event Read Surface Test Matrix](../testing/audit-event-read-surface-test-matrix.md).
At minimum, Code Round coverage must prove:

- aggregate holds can be configured;
- bounded global-window holds can be configured;
- unbounded global holds are rejected;
- CLI and HTTP/oRPC dispatch use the shared command schema.

## Current Implementation Notes And Migration Gaps

This command is specified but not implemented. Code Round must add persistence, command handling,
entrypoints, operation catalog/docs coverage, and hold-aware prune behavior.
