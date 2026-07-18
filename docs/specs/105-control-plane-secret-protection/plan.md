# Plan: Control-Plane Secret Protection And Key Rotation

## Governing Sources

- ADR-012, ADR-014, ADR-023, ADR-041, ADR-087, and ADR-089.
- `docs/workflows/deployments.create.md`, `docs/workflows/control-plane-secret-key-rotation.md`.
- `docs/errors/control-plane-secret-protection.md`.
- `docs/testing/control-plane-secret-protection-test-matrix.md`.

## Architecture Approach

- Add a neutral application port for protect/unprotect/inspect/rewrap and a versioned AES-GCM adapter.
- Protect secret command input before aggregate persistence; snapshots retain envelopes, not plaintext.
- Validate every snapshot secret before plan/admission and materialize all-or-nothing inside the shared
  runtime environment resolver used by Docker, Compose, SSH, and Swarm.
- Add a PG/PGlite rotation port that classifies every supported row, requires a matching safe plan
  digest, and updates all rows in one transaction.
- Return bounded safe findings for unreadable rows and let the source CLI run plan/apply against the
  existing coordinated SSH PGlite mirror lifecycle. Read-only plan never uploads the mirror.
- Extend Deployment Proof with value-free planned/observed environment key-set evidence.

## Persistence And Migration

- Covered rows: Environment variables, Resource variables, Deployment environment snapshots,
  dependency Resource secrets, and dependency binding secrets.
- Legacy plaintext remains recognizable but is rejected by plan/execution until explicit migration.
- Rotation keeps old keys in the decrypt window, performs a preflight, and uses one transaction;
  interrupted apply leaves the original state intact.
- External database backup/restore remains the recovery substrate. Apply requires a non-secret backup
  evidence reference and never stores backup contents.

## Testing Strategy

- Bind every `CPS-*` row to unit, application, persistence, contract, CLI/Web, runtime adapter, and
  real Docker tests as listed in the dedicated matrix.
- Use marker keys and assert only key presence/count/fingerprint at runtime.
- Verify red-green behavior for missing/wrong/corrupt keys and mid-transaction rollback.
- Verify SSH plan leaves the remote sync revision unchanged and apply retains backup/revision fencing.

## Risks And Deferred Gaps

- Provider-managed KMS/HSM adapters remain additive implementations of the same public port.
- SSH credential and certificate-at-rest hardening are audited separately; this slice owns workload
  environment and dependency-secret deployment correctness.
