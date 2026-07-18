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
  existing coordinated SSH PGlite mirror lifecycle. Read-only plan only holds an ephemeral lock; it
  never creates durable markers, migrates schema, recovers stale locks, or uploads the mirror.
  Download and upload use private temporary archive files so mirror size does not become process
  output-buffer or input-buffer pressure; cleanup removes those files on every exit path.
- Add an opt-in safe JSON CLI error renderer for unattended maintenance. It serializes a fixed
  allowlist of stable classification fields and replaces unknown failures with an unclassified code.
- Let pre-migration rotation planning recognize absent post-initial secret-bearing tables as empty
  sources while retaining fail-closed behavior for every non-`42P01` read failure.
- Preserve fixed source-specific failure reasons through the operation boundary so unattended
  maintenance can locate the failing read without publishing database error details.
- Read post-initial optional sources directly and classify only PostgreSQL `42P01` as legacy
  absence, avoiding schema-catalog assumptions while preserving fail-closed behavior.
- Read every rotation source directly before migrations so fresh or partially initialized state can
  classify exact PostgreSQL `42P01` as empty without weakening any other source failure.
- Reduce a bounded SQLSTATE allowlist to fixed safe operational categories while keeping raw codes,
  database messages, queries, relations, hosts, and paths outside the published contract.
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
- Verify SSH archive download uses a file sink and upload uses a file source rather than returning or
  accepting the complete compressed archive as an in-memory byte array.
- Verify the safe CLI error contract omits arbitrary messages, stderr, hosts, paths, ciphertext, and
  secret markers for both domain and unknown failures.
- Verify a PGlite state stopped before the first post-initial secret table can still produce a safe
  rotation plan without implicitly migrating that state.
- Verify a pre-initial PGlite state with no rotation source tables produces a safe empty-source plan.
- Verify schema-incompatible and nested undefined-table failures expose only fixed safe categories.
- Verify known driver wrapper fields and SQLSTATE aliases preserve the same bounded safe categories.
- Verify a failed source returns only its stable source reason and no SQL/schema details.

## Risks And Deferred Gaps

- Provider-managed KMS/HSM adapters remain additive implementations of the same public port.
- SSH credential and certificate-at-rest hardening are audited separately; this slice owns workload
  environment and dependency-secret deployment correctness.
