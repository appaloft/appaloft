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

Dry-run performs no writes and returns only record/variable counts, envelope states, safe key ids,
readiness, and a deterministic plan digest. Apply rejects a stale digest, missing backup reference,
unreadable envelope, absent target key, or legacy row without explicit authorization.

Use the source CLI from the repository checkout:

```bash
appaloft db secret-rotation plan
appaloft db secret-rotation apply \
  --plan-digest sha256:<dry-run-digest> \
  --backup-reference <external-backup-reference>
```

Add `--allow-legacy-plaintext` only for the separately approved one-time migration of pre-envelope
rows. Keep the old key in `APPALOFT_CONTROL_PLANE_SECRET_KEYS` until the post-commit plan reports no
retained-key rows and the compatibility window has closed. The active key id is configured through
`APPALOFT_CONTROL_PLANE_ACTIVE_SECRET_KEY_ID`; the keyring is a JSON object whose values are canonical
base64 encodings of 32-byte keys. The checked-in `.env.example` value is local-development-only and
must never be reused outside disposable local data.

Any failure before commit leaves the original database unchanged. Operators restore through the
normal database backup/restore substrate when an external failure occurs after commit. Appaloft does
not export secret values as a rotation backup.
