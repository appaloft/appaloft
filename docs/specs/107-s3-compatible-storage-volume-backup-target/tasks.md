# Tasks: S3-Compatible Storage Volume Backup Target

## Source Of Truth And Test-First

- [x] Add accepted spec, plan, tasks, and stable Test Matrix ids.
- [x] Add failing contract/runtime tests for independent source selection and S3 transfer.
- [x] Add restore checksum and exact-object prune tests.
- [x] Add secret non-persistence/redaction assertions.

## Implementation

- [x] Add neutral object-transfer broker port and authorization result types.
- [x] Add S3-compatible runtime store/restore/prune target provider.
- [x] Add upload/download renderers with cleanup and checksum verification.
- [x] Compose the provider only when a broker is explicitly injected.

## Docs And Verification

- [x] Update public storage-volume docs and ADR-083 governed-spec notes.
- [x] Run application and runtime backup tests plus typecheck/lint for touched packages.
- [x] Reconcile spec, matrix, tests, implementation, and deferred follow-ups.
