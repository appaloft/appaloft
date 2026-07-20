# Storage Volume Backup Automation

## Status

- Round: Spec + Test-First
- Artifact state: ready for Code Round
- Compatibility impact: additive minor surface
- Decision: [ADR-091](../../decisions/ADR-091-storage-volume-backup-automation.md)

## Business Outcome

Operators can opt a storage volume into scheduled and pre-deploy backup, automatically enforce
retention after verification, and see or receive actionable failure evidence.

## Public Surfaces

- API/CLI/Web: `storage-volumes.backup-policies.configure/list/show`.
- Worker: scheduled policy runner and expired-retention execution.
- Deployment: pre-deploy protection hook dispatching the existing backup command.
- Readback: policy last/next run, last outcome, last backup/process attempt, prune count, and
  notification outcome.

## Acceptance Criteria

| ID | Scenario | Then |
| --- | --- | --- |
| STOR-BACKUP-AUTO-POLICY-001 | Configure/read policy | Safe trigger, plan, retention, failure, and notification metadata round-trips through API/CLI/Web. |
| STOR-BACKUP-AUTO-SCHEDULE-002 | Due scheduled policy | Existing create-backup command runs once with durable attempt/readback and advances next run. |
| STOR-BACKUP-AUTO-PREDEPLOY-003 | Resource deployment has attached protected volume | Backup finishes before runtime mutation; `block` failure rejects deployment and `continue` records evidence. |
| STOR-BACKUP-AUTO-RETENTION-004 | Verified backup exceeds max count/age | Existing prune command removes only eligible older artifacts and preserves at least one ready restore point. |
| STOR-BACKUP-AUTO-NOTIFY-005 | Backup or retention fails | Safe notification port is called; original and notification outcomes are both visible without secrets. |
| STOR-BACKUP-AUTO-IDEMPOTENT-006 | Duplicate runner tick | Dedupe/process claim prevents duplicate admitted work for the same policy schedule. |

## Non-Goals

- No new provider-specific backup implementation.
- No webhook trigger in this slice.
- No full notification-center product.
