# Control-Plane Secret Key Rotation Workflow

```text
configure active + retained keyring
  -> rotation dry-run (counts/status only)
  -> external database backup and evidence reference
  -> apply with matching plan digest
  -> preflight every selected secret
  -> one transaction rewraps every selected secret
  -> post-commit dry-run reports all-active
  -> remove old key only after compatibility window closes
```

Dry-run performs no business-state writes and returns only record/variable counts, envelope states,
safe key ids, bounded safe unreadable findings, readiness, and a deterministic plan digest. Apply
rejects a stale digest, missing backup reference, unreadable envelope, absent target key, or legacy
row without explicit authorization.

Dry-run runs before application migrations. A fresh or partially initialized state can therefore
lack any rotation source table. Direct source reads treat only PostgreSQL's exact undefined-table
code `42P01` as an empty source; any other read failure remains a safe, fail-closed source error.
Known SQLSTATE families are reduced to fixed categories such as schema-incompatible,
feature-unsupported, state-unavailable, or storage-corrupt. The raw SQLSTATE, database message,
query, relation, host, and path are never published; unknown failures keep the generic read-failed
category.
Known driver wrapper fields and SQLSTATE aliases are inspected only within a bounded traversal;
arbitrary payload fields are ignored.

Use the source CLI from the repository checkout:

```bash
appaloft db secret-rotation plan
appaloft db secret-rotation apply \
  --plan-digest sha256:<dry-run-digest> \
  --backup-reference <external-backup-reference>
```

For SSH-server PGlite state, add the same explicit target options to plan and apply:

```bash
appaloft db secret-rotation plan \
  --state-backend ssh-pglite \
  --server-host <host> \
  --server-ssh-username <user> \
  --server-ssh-private-key-file <path>
```

The read-only plan may hold an ephemeral state-root coordination lock and removes it on release. It
does not create a backend marker, migrate a schema marker, recover a stale lock, or upload its local
mirror. Apply uses the normal durable preparation, remote backup, revision fence, and conflict-safe
merge before replacing server state.

Add `--allow-legacy-plaintext` only for the separately approved one-time migration of pre-envelope
rows. Keep the old key in `APPALOFT_CONTROL_PLANE_SECRET_KEYS` until the post-commit plan reports no
retained-key rows and the compatibility window has closed. The active key id is configured through
`APPALOFT_CONTROL_PLANE_ACTIVE_SECRET_KEY_ID`; the keyring is a JSON object whose values are canonical
base64 encodings of 32-byte keys. The checked-in `.env.example` value is local-development-only and
must never be reused outside disposable local data.

Any failure before commit leaves the original database unchanged. Operators restore through the
normal database backup/restore substrate when an external failure occurs after commit. Appaloft does
not export secret values as a rotation backup.
