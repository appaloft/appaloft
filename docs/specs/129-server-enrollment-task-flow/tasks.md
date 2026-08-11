# Tasks: Server Enrollment Task Flow

## Spec Round

- [x] Record owner-confirmed local/VPS enrollment outcome and rejected alternatives.
- [x] Define existing operation sequence, secret boundary, checkpoint and failure recovery.
- [x] Define stable `SERVER-ENROLL-*` Test Matrix ids and no-new-operation rationale.
- [x] Accept ADR-108 and this Spec through public review before Ticket or Code Round (#1036).

## Ticket

- [x] Create one public actor-visible issue linked to this Spec and every Test Matrix id (#1037).
- [x] Mark it `ready-for-agent` only after Spec acceptance and implementation paths are known.

## Test First

- [x] Add failing local/SSH target parsing and pre-mutation rejection tests.
- [x] Add failing ordered existing-command/query dispatch tests.
- [x] Add failing safe checkpoint, readiness and final readback tests.
- [x] Add failing partial-failure retention and secret-redaction tests.
- [x] Add granular command compatibility regressions.

## Implementation

- [x] Add the `server enroll` CLI task command with bounded local/SSH inputs.
- [x] Compose existing register/credential/doctor/runtime/show messages through `CliRuntime`.
- [x] Fail closed on runtime preparation failure and retain the registered Server id checkpoint.
- [x] Preserve local/remote command buses and all granular Server commands.

## Verification And Sync

- [x] Run focused CLI tests, lint, typecheck, full tests and build.
- [x] Update localized docs/help, ADR verification, operation map and traceability.
- [ ] Merge public implementation, close the Ticket and update the Cloud gitlink after independent
  boundary review.
