# Control-Plane Secret Protection And Key Rotation

## Status

- Round: Post-Implementation Sync
- Artifact state: implemented and verified across focused, package, integration, and real-substrate tests
- Roadmap target: deployment correctness and self-hosted security hardening
- Compatibility impact: security fix with an explicit migration gate for legacy plaintext secret rows

## Business Outcome

Appaloft never converts unavailable control-plane secret material into an empty value, a missing
environment key, or a successful deployment. Workload secret values are protected at rest,
identified by envelope and key version, validated before deployment planning, resolved only at
runtime materialization, and rotated through an explicit atomic migration.

## Ubiquitous Language

| Term | Meaning | Context |
| --- | --- | --- |
| Secret envelope | Versioned authenticated ciphertext containing a safe key id and no plaintext metadata. | Control-plane secret protection |
| Keyring | One active encryption key plus zero or more retained decrypt-only keys. | Control-plane composition |
| Secret materialization | Transient conversion of a valid secret envelope into a runtime value immediately before substrate execution. | Runtime target adapter |
| Rotation plan | Read-only classification of protected, legacy, and unreadable secret records using counts and safe status only. | System maintenance |
| Rotation apply | One compare-and-apply transaction that rewraps every selected secret to the active key or changes nothing. | System maintenance |
| Legacy plaintext | A pre-envelope secret row that is recognizable but never deployable until an explicitly authorized migration protects it. | Migration |
| Environment key proof | A value-free comparison of the planned and observed runtime environment key set and count. | Deployment proof |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| CPS-PROTECT-001 | Normal secret deployment | A configured active key protects Environment and Resource secrets | A deployment is planned and executed | Every secret decrypts, every planned key reaches the workload, and no public result contains a value. |
| CPS-FAIL-002 | Missing keyring | A snapshot contains protected or legacy secret material and no usable keyring exists | Plan or execution starts | The operation fails before runtime mutation; no deployment succeeds. |
| CPS-FAIL-003 | Wrong key | The envelope key id is present but authentication fails | Plan, retry, rollback, or execution starts | The whole attempt fails closed with a safe actionable error. |
| CPS-FAIL-004 | Corrupt envelope | Envelope syntax, nonce, tag, or ciphertext is invalid | Plan or execution starts | The whole attempt fails closed without secret metadata or length disclosure. |
| CPS-FAIL-005 | Partial secret failure | One of several secret variables cannot be materialized | Plan or execution starts | No runtime mutation receives a partial environment. |
| CPS-ROTATE-006 | Successful rotation | Old and active keys are both available | Dry-run and apply are performed | All selected records move atomically to the active key and old ciphertext remains decryptable only until migration completes. |
| CPS-ROTATE-007 | Interrupted rotation | A failure occurs after migration writes begin | Apply runs and is retried | The first transaction rolls back completely; retry is idempotent and produces one recognizable active-key state. |
| CPS-ROTATE-008 | Legacy migration | Legacy plaintext exists | Dry-run runs without explicit legacy authorization | It reports counts and blocks apply; explicit migration with a backup reference protects all rows atomically. |
| CPS-SUBSTRATE-009 | Substrate parity | A snapshot contains plain and secret runtime keys | Docker, Compose, SSH Compose, or Swarm executes | Every substrate receives the same key set; Swarm does not silently convert env secrets into file-only secrets. |
| CPS-PROOF-010 | Runtime key mismatch | Runtime reports success but inspect readback is missing one or more planned keys | Deployment is verified | Success is rejected or proof is failed; planned/observed counts and key-set fingerprints contain no values. |
| CPS-SAFE-011 | Safe outputs | Secret protection fails through API, CLI, Web, logs, diagnostics, or proof | Output is serialized | It exposes stable code, phase, key id/status and counts only; never plaintext, ciphertext, key material, secret length, or provider payload. |
| CPS-COMPAT-012 | Retained legal ciphertext | A historical envelope uses a retained supported key/version | It is planned, retried, rolled back, or migrated | It decrypts under the documented compatibility window and can be rewrapped to the active key. |
| CPS-REMOTE-013 | SSH PGlite maintenance | A pure CLI installation keeps Appaloft state on an SSH server | Rotation plan or apply runs with an explicit SSH target | Plan reads a coordinated local mirror without uploading it; apply alone performs the guarded backup, revision-fenced upload, and conflict-safe merge. |
| CPS-DIAG-014 | Unreadable record diagnosis | One or more persisted envelopes cannot be authenticated or parsed | Rotation dry-run classifies the state | The bounded result identifies the record source, business ids, variable key when applicable, and stable reason without returning values, ciphertext, key material, or secret length. |

## Domain Ownership

- Configuration owns secret-bearing Environment and Resource entries.
- Release Orchestration owns immutable encrypted deployment snapshots and deployment admission.
- Runtime Target adapters own transient secret materialization and substrate-specific key-set readback.
- System maintenance owns rotation planning/apply; it is not a Resource, Environment, or Deployment mutation.
- PostgreSQL/PGlite persistence implements one atomic rotation transaction behind a neutral port.

## Public Surfaces

- Existing API/CLI/Web Resource and Environment secret inputs continue to dispatch shared commands.
- `deployments.plan`, `deployments.create`, retry, redeploy, and rollback fail closed on any unavailable secret.
- Rotation exposes a read-only dry-run and an explicit apply command with plan digest, backup
  reference, active key id, legacy authorization, bounded unreadable-record diagnostics, and an
  explicit SSH PGlite target when the server owns state. Values are never accepted or returned.
- Deployment Proof reports planned/observed environment key count and fingerprint only.

## Non-Goals

- Provider KMS implementation, Enterprise key custody policy, or Cloud commercial policy.
- Returning, exporting, logging, or backing up secret values through Appaloft APIs.
- Treating Docker secret files as equivalent to environment variables.
- Automatic rotation on startup or implicit plaintext migration.

## Closed Decisions

- AES-256-GCM envelopes are versioned and carry a safe key id; retained keys are decrypt-only.
- Missing configuration and unknown/corrupt envelopes are errors, never empty strings or filtered entries.
- Rotation preflights every selected record and then commits in one database transaction.
- Apply requires a matching dry-run digest and an operator-supplied external backup reference.
- Deployment configuration fingerprints never depend on ciphertext bytes, so key rotation does not
  create false runtime drift.
