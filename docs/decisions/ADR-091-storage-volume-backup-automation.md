# ADR-091: Storage Volume Backup Automation

Status: Accepted

Date: 2026-07-20

## Context

Spec 098 and ADR-083 provide manual storage-volume backup, restore, and prune operations. A
production backup loop also needs opt-in scheduling, pre-deployment protection, retention
execution, durable failure visibility, and notification without creating a second backup path.

## Decision

`StorageVolumeBackupPolicy` is application-owned policy state for one `StorageVolume`. It stores a
safe `StorageBackupPlanRequest`, scheduled and pre-deploy trigger enablement, failure mode, retry
preference, notification reference, and retention policy. Both triggers dispatch the existing
`storage-volumes.create-backup` command. They never call a provider directly.

The scheduled runner is disabled by default. Pre-deploy protection runs after deployment admission
has resolved the Resource and before runtime mutation. A policy with `block` failure mode rejects
deployment when the backup or required retention pass fails; `continue` records the failure and
allows deployment.

After a new artifact is verified, automation may dispatch `storage-volumes.prune-backups` for
expired or over-count restore points. It must retain at least one ready restore point and must not
mark provider cleanup complete before the provider confirms deletion.

Every automation run records a durable process attempt. Failures are sent through an optional
provider-neutral `BackupAutomationNotificationPort`; notification failure is also recorded and
never hides the original backup failure.

## Consequences

- Manual, scheduled, and pre-deploy backups share one command/provider lifecycle.
- Policy/readback is available through API, CLI, Web, and generated contracts.
- Retention is destructive only after successful artifact verification.
- Provider credentials and notification secrets remain adapter-only.

## Governed Specs

- [Storage Volume Backup Automation](../specs/108-storage-volume-backup-automation/spec.md)
- [Storage Volume Backup And Restore](../specs/098-storage-volume-backup-restore/spec.md)
- [Storage Volume Backup Automation Test Matrix](../testing/storage-volume-backup-automation-test-matrix.md)
