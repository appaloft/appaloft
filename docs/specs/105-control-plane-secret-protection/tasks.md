# Tasks: Control-Plane Secret Protection And Key Rotation

## Source Of Truth

- [x] Create spec, ADR-089, workflow, error contract, implementation plan, and Test Matrix.
- [x] Synchronize Domain Model, Business Operation Map, Core Operations, SECURITY, operation catalog,
  and public docs/help.

## Test-First

- [x] Add red tests for `CPS-PROTECT-*`, `CPS-FAIL-*`, and `CPS-ROTATE-*`.
- [x] Add Docker/Compose/SSH/Swarm key parity and Deployment Proof mismatch tests.
- [x] Add API/CLI/Web/log/diagnostic redaction tests.

## Implementation

- [x] Implement versioned protector/keyring configuration and safe errors.
- [x] Protect secret writes and validate/materialize snapshots all-or-nothing.
- [x] Implement atomic dry-run/apply migration with plan digest, backup reference, and retry.
- [x] Add bounded safe unreadable-record findings and coordinated SSH PGlite plan/apply support.
- [x] Keep SSH PGlite plan preparation free of durable marker, migration, stale-lock recovery, and upload writes.
- [x] Stream SSH PGlite plan/apply archives through private temporary files with bounded process memory.
- [x] Make Swarm env semantics and runtime key proof consistent with other substrates.

## Verification And Sync

- [x] Run focused, package, integration, real Docker, typecheck, lint, and source-leak scans.
- [ ] Complete Post-Implementation Sync and dual-repository commit/PR checks.
