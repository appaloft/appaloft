# Spec: Deployment Log Retention

## Status

Code Round active.

## Business Need

Operators need a safe way to reduce retained deployment-attempt log volume while preserving
deployment history and recovery context. Deployment logs are attempt/progress records embedded on
Deployment rows; pruning them must not be confused with deleting deployments or pruning resource
runtime logs.

## Canonical Terms

| Term | Meaning |
| --- | --- |
| Deployment log retention | Policy for keeping or pruning embedded Deployment log entries. |
| Embedded deployment log entry | One entry in a Deployment row's `logs` JSON array. |
| Deployment row | The durable deployment attempt record; it is retained by this command. |
| Resource runtime logs | Resource-owned runtime observation; out of scope for this command. |

## Scenarios

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| DEP-LOG-PRUNE-001 | Dry-run by default | deployments have old embedded log entries | `deployments.logs.prune` omits `dryRun` | matching counts are returned and no log entry is removed. |
| DEP-LOG-PRUNE-002 | Destructive prune | deployments have old matching and newer/out-of-scope entries | `deployments.logs.prune` sets `dryRun = false` | only old matching embedded entries are removed. |
| DEP-LOG-PRUNE-003 | Cutoff safety | log entries exist before, equal to, and after `before` | prune runs | only entries with `timestamp < before` are eligible. |
| DEP-LOG-PRUNE-004 | Entrypoint dispatch | CLI or HTTP calls the operation | input validates | adapters dispatch `PruneDeploymentLogsCommand` through command bus. |

## Public Surfaces

- CLI: `appaloft deployments logs prune --before <iso>`.
- API: `POST /api/deployments/logs/prune`.
- Public docs help topic: deployment/runtime observability docs.
- Web: future operator maintenance UI only.

## Acceptance Criteria

- The operation appears in `docs/BUSINESS_OPERATION_MAP.md`, `docs/CORE_OPERATIONS.md`, and
  `packages/application/src/operation-catalog.ts`.
- CLI and HTTP/oRPC reuse the application command schema.
- Dry-run is the default.
- Destructive mode removes only old matching embedded log entries.
- Deployment rows, status, snapshots, rollback metadata, provider job logs, audit rows, runtime
  logs, event streams, outbox/inbox state, runtime artifacts, and business state are untouched.
- Focused application, persistence, CLI, HTTP/oRPC, docs-registry, typecheck, and lint
  verification pass.

## Current Implementation Notes And Migration Gaps

Resource runtime log archives, domain event stream retention, legal holds, immutable archives,
organization-level retention defaults, global export, and scheduled history retention automation
are governed by separate Phase 9 slices. ADR-054 defines durable process attempts as the current
outbox/inbox-equivalent baseline, so accepted background-work retention is covered by
`operator-work.prune`; a separate outbox/inbox retention command is not applicable unless a future
ADR introduces a separate store.
