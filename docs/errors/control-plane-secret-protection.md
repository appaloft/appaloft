# Control-Plane Secret Protection Errors

| Code/reason | Phase | Retryable | Safe recovery |
| --- | --- | --- | --- |
| `control_plane_secret_keyring_unavailable` | `control-plane-secret-materialization` | false | Configure the active/retained keyring; do not redeploy with empty values. |
| `control_plane_secret_materialization_failed` / `decrypt-key-unavailable` | `control-plane-secret-materialization` | false | Restore the retained key or run the documented migration. |
| `control_plane_secret_materialization_failed` / `authentication-failed` | `control-plane-secret-materialization` | false | Treat the key as wrong or ciphertext as corrupt; restore/migrate from a verified backup. |
| `control_plane_secret_materialization_failed` / `envelope-invalid` or `envelope-unreadable` | `control-plane-secret-materialization` | false | Repair from backup; never replace with an empty value. |
| `control_plane_secret_legacy_migration_required` | `control-plane-secret-materialization` | false | Dry-run, back up, and explicitly migrate legacy rows. |
| `control_plane_secret_rotation_backup_required` | `control-plane-secret-rotation` | false | Create an external database backup and pass its reference. |
| `control_plane_secret_rotation_plan_stale` | `control-plane-secret-rotation` | false | Repeat dry-run and apply the new digest. |
| `control_plane_secret_rotation_failed` | `control-plane-secret-rotation` | false | Verify rollback, keep old keys, and retry from dry-run. |

Errors may include phase, reason, record counts, and migration status. They must not
include plaintext, ciphertext, key bytes, secret length, provider payload, or decrypted fragments.
