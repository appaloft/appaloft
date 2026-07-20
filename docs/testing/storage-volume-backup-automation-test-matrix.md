# Storage Volume Backup Automation Test Matrix

| ID | Automation | Binding | Status |
| --- | --- | --- | --- |
| STOR-BACKUP-AUTO-POLICY-001 | application/persistence/API/CLI/Web | `storage-volume-backup-automation.test.ts`; `storage-volume-backup-policy.pglite.test.ts`; `data-safety-and-tunnel.http.test.ts` | passing |
| STOR-BACKUP-AUTO-SCHEDULE-002 | application/worker | `storage-volume-backup-automation.test.ts`; `scheduled-storage-volume-backup-runner.test.ts` | passing |
| STOR-BACKUP-AUTO-PREDEPLOY-003 | application/integration | `storage-volume-backup-automation.test.ts`; `create-deployment.test.ts` | passing |
| STOR-BACKUP-AUTO-RETENTION-004 | application/provider | `storage-volume-backup-automation.test.ts` | passing |
| STOR-BACKUP-AUTO-NOTIFY-005 | application/adapter | `storage-volume-backup-automation.test.ts` | passing |
| STOR-BACKUP-AUTO-IDEMPOTENT-006 | worker/persistence | `storage-volume-backup-policy.pglite.test.ts`; `scheduled-storage-volume-backup-runner.test.ts` | passing |
