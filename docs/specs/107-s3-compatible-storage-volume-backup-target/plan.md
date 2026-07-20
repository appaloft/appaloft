# Plan: S3-Compatible Storage Volume Backup Target

## Architecture Approach

1. Extend the public storage backup contract with an object-transfer broker port whose values are
   short-lived upload/download authorizations and safe artifact handles.
2. Make Docker tar and SQLite source adapters target-independent as required by ADR-083.
3. Add runtime command rendering for authorized upload and download/restore, with checksum
   verification, working-file cleanup, and error redaction.
4. Register the S3-compatible target only when the composition root supplies a broker.
5. Reuse all existing command/query, CLI, HTTP/oRPC, Web, aggregate, and persistence surfaces.

## Test Strategy

| ID | Automation | Binding |
| --- | --- | --- |
| STOR-BACKUP-OFFSITE-PLAN-001 | application/runtime unit | `storage-volume-backup-contract.test.ts`; `storage-volume-backup-provider.test.ts` |
| STOR-BACKUP-OFFSITE-STORE-001 | runtime unit | `storage-volume-backup-provider.test.ts` |
| STOR-BACKUP-OFFSITE-RESTORE-001 | application/runtime unit | `storage-volume-backup-restore.test.ts`; `storage-volume-backup-provider.test.ts` |
| STOR-BACKUP-OFFSITE-PRUNE-001 | application/runtime unit | `storage-volume-backup-restore.test.ts`; `storage-volume-backup-provider.test.ts` |
| STOR-BACKUP-OFFSITE-SECRET-001 | runtime unit | `storage-volume-backup-provider.test.ts` |

## Compatibility

- Existing local filesystem behavior and registry construction remain unchanged when no broker is
  supplied.
- Existing operation schemas do not change.
- The restore request adds optional checksum evidence; older providers may ignore it.
