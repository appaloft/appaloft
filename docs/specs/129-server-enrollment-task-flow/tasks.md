# Tasks: Server Enrollment Task Flow

## Spec Round

- [x] Record owner-confirmed local/VPS enrollment outcome and rejected alternatives.
- [x] Define existing operation sequence, secret boundary, checkpoint and failure recovery.
- [x] Define stable `SERVER-ENROLL-*` Test Matrix ids and no-new-operation rationale.
- [ ] Accept ADR-108 and this Spec through public review before Ticket or Code Round.

## Ticket

- [ ] Create one public actor-visible issue linked to this Spec and every Test Matrix id.
- [ ] Mark it `ready-for-agent` only after Spec acceptance and implementation paths are known.

## Test First

- [ ] Add failing local/SSH target parsing and pre-mutation rejection tests.
- [ ] Add failing ordered existing-command/query dispatch tests.
- [ ] Add failing safe checkpoint, readiness and final readback tests.
- [ ] Add failing partial-failure retention and secret-redaction tests.
- [ ] Add granular command compatibility regressions.

## Implementation

- [ ] Add the `server enroll` CLI task command with bounded local/SSH inputs.
- [ ] Compose existing register/credential/doctor/runtime/show messages through `CliRuntime`.
- [ ] Fail closed on runtime preparation failure and retain the registered Server id checkpoint.
- [ ] Preserve local/remote command buses and all granular Server commands.

## Verification And Sync

- [ ] Run focused CLI tests, lint, typecheck, full tests and build.
- [ ] Update localized docs/help, ADR verification, operation map and traceability.
- [ ] Merge public implementation, close the Ticket and update the Cloud gitlink after independent
  boundary review.
