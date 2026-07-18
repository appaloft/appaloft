# ADR-089: Control-Plane Secret Protection And Key Rotation

Status: Accepted

Date: 2026-07-16

## Context

Resource and Environment secret inputs currently enter aggregate state and deployment snapshots as
raw text. PG/PGlite dependency secret stores also persist raw values. Runtime adapters later inject
those values directly, while Docker Swarm treats Resource env secrets as pre-existing Docker secret
names. There is no implemented keyring, envelope version, old-key window, explicit migration, or
runtime environment key-set verification. A control-plane key failure therefore cannot be handled
safely because no common protection boundary exists.

## Decision

Appaloft adopts a provider-neutral control-plane secret protection port. The Community adapter uses
versioned authenticated AES-256-GCM envelopes with one active encryption key and retained decrypt-only
keys. Secret-bearing Environment/Resource entries, immutable Deployment snapshots, and dependency
runtime secret payloads persist envelopes. Plaintext exists only at command ingress and transient
runtime materialization.

Every plan, create, retry, redeploy, rollback, Docker, Compose, SSH, and Swarm path must validate all
secret envelopes before mutation. One failure aborts the entire environment. No adapter may map a
failure to an empty string, omit the key, or continue to terminal success.

Key rotation is an explicit System Maintenance workflow: dry-run classifies safe counts and states;
apply requires the dry-run digest, target active key, explicit legacy authorization when needed, and
an external backup evidence reference. The PG/PGlite adapter preflights all rows and commits all
rewraps in one transaction. Failure rolls back the entire migration; retry is idempotent.
Because dry-run precedes application migrations, every source is read directly and exact PostgreSQL
`42P01` is treated as an empty source for fresh or partially initialized state. All other source
failures remain fail closed and expose only their fixed safe classification.
Environment and Resource source reads select the `is_secret` marker without a database boolean
predicate and exclude non-secret rows in memory before inspection or plan accounting. The earlier
parameter-free `IS TRUE` compatibility attempt removed bind inference but live preflight showed that
the predicate itself was still not a reliable pre-migration boundary for the legacy embedded runtime.
For unattended diagnosis, a bounded SQLSTATE class allowlist maps to fixed operational categories
without publishing the SQLSTATE or database detail; exact `42P01` alone means an empty source and
unknown failures retain the generic read-failed reason. The allowlist includes fixed connection,
data, integrity, transaction, authorization, resource, operator, system, configuration,
foreign-data, procedural, schema, feature, state, and internal-storage families so a bounded column
probe can identify the failing operational boundary without exposing the underlying code or row.
Only known driver wrapper fields and SQLSTATE aliases are traversed, with bounded depth and node count.
When a generic Environment identifier read remains, the adapter first runs a parameter-free zero-row
identifier query and only then a one-row identifier probe. This separates fixed schema-shape and row
materialization boundaries while both remain fail closed; neither probe publishes SQL, relation names,
values, row counts, messages, hosts, or paths.
Every rotation source is scanned through deterministic bounded keyset pages over its stable identifier.
The coordinated plan mirror is immutable for the duration of the read, so keyset pagination visits
every source row exactly once without offset drift. A missing or non-increasing cursor is a fail-closed
source read failure; the adapter never treats an incomplete page sequence as a valid rotation plan.

Dry-run may return a bounded list of unreadable findings containing only record source, stable
business ids, variable key/index when applicable, safe envelope key id, and stable failure reason.
It never returns values, ciphertext, key material, or secret length. When SSH PGlite owns state,
the source CLI uses the coordinated remote mirror lifecycle. Plan may hold and release an ephemeral
coordination lock, but it does not create backend markers, migrate schema markers, recover stale
locks, or upload state. Apply alone performs durable preparation, backup, revision-fenced upload,
and conflict-safe merge.

Deployment Proof compares the planned and observed runtime environment key set and count without
returning values. Secret ciphertext is excluded from configuration fingerprint semantics so rewraps
do not create false drift.

## Consequences

- Missing/wrong keys and corrupt/legacy envelopes become stable fail-closed operational errors.
- Self-hosted and hosted composition must configure a keyring before accepting or deploying secrets.
- Existing plaintext rows require an explicit backed-up migration before deployment.
- Provider KMS/Vault adapters may implement the same port without changing public domain behavior.
- Docker Swarm must honor environment-variable semantics; file-only Docker secrets are not a silent
  substitute for an env key.

## Governed Sources

- `docs/specs/105-control-plane-secret-protection/`
- `docs/workflows/control-plane-secret-key-rotation.md`
- `docs/errors/control-plane-secret-protection.md`
- `docs/testing/control-plane-secret-protection-test-matrix.md`
- ADR-012, ADR-041, and ADR-087.
