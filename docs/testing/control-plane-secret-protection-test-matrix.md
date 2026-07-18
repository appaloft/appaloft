# Control-Plane Secret Protection Test Matrix

| ID | Scenario | Surface | Automation | Binding | Status |
| --- | --- | --- | --- | --- | --- |
| CPS-PROTECT-001 | Normal protect/unprotect and deployment materialization. | crypto/application/runtime | unit + integration | `control-plane-secret-protector.test.ts`; environment/resource lifecycle; deployment create/plan; dependency stores | passing |
| CPS-FAIL-002 | Missing keyring blocks plan and execution. | application/runtime | integration | `create-deployment.test.ts`; `deployment-plan-preview.test.ts` | passing |
| CPS-FAIL-003 | Wrong key fails authentication without fallback. | crypto/application | unit + integration | `control-plane-secret-protector.test.ts`; plan/runtime materialization tests | passing |
| CPS-FAIL-004 | Corrupt envelope blocks the whole operation. | crypto/application | unit + integration | `control-plane-secret-protector.test.ts`; plan/runtime materialization tests | passing |
| CPS-FAIL-005 | One invalid variable prevents partial runtime env. | runtime adapters | integration | `dependency-runtime-secrets.test.ts` | passing |
| CPS-ROTATE-006 | Old-to-new rotation is atomic and decrypt-compatible. | PG/PGlite | integration | `control-plane-secret-rotation.pglite.test.ts` | passing |
| CPS-ROTATE-007 | Mid-transaction failure rolls back; retry is idempotent. | PG/PGlite | integration | `control-plane-secret-rotation.pglite.test.ts` | passing |
| CPS-ROTATE-008 | Legacy plaintext requires explicit migration and backup ref. | PG/PGlite + CLI | integration | rotation PGlite tests and source CLI smoke | passing |
| CPS-SUBSTRATE-009 | Docker, Compose, SSH Compose, and Swarm preserve all runtime keys. | runtime adapters | integration + real Docker/Swarm | runtime command/readback tests; Swarm fake and opt-in real execution; local Docker/Compose smoke | passing |
| CPS-PROOF-010 | Missing observed runtime keys cannot be reported as matching/successful. | deployment proof/Web/API | integration | `deployment-proof-evidence.test.ts`; application and transport proof tests | passing |
| CPS-SAFE-011 | Logs, errors, API, CLI, diagnostics, and proof leak no secret/cipher/key material. | published surfaces | integration | protector, runtime redaction, proof evidence, CLI smoke, transport tests, source scan | passing |
| CPS-COMPAT-012 | Retained old key/version decrypts and rewraps to active. | crypto/PG | unit + integration | protector retained-key test and rotation PGlite tests | passing |
| CPS-REMOTE-013 | SSH PGlite rotation plan is read-only remotely; apply retains guarded sync semantics. | shell/CLI/SSH PGlite | integration | `remote-pglite-state-sync.test.ts`; source CLI help smoke | passing |
| CPS-DIAG-014 | Unreadable plan findings are bounded, actionable, and value/ciphertext free. | PG/PGlite + CLI | integration | `control-plane-secret-rotation.pglite.test.ts`; source leak assertion | passing |
