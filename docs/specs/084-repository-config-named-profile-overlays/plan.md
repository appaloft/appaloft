# Repository Config Named Profile Overlays Plan

## Summary

Add `profiles.<key>` as a safe repository config overlay selected by trusted CLI/Action input.

## Source Of Truth

- [ADR-075](../../decisions/ADR-075-repository-config-named-profile-overlays.md)
- [Deployment Config File Bootstrap](../../workflows/deployment-config-file-bootstrap.md)
- [Deployment Config File Test Matrix](../../testing/deployment-config-file-test-matrix.md)
- [Public Config File Docs](../../../apps/docs/src/content/docs/en/environments/reference/config-file.md)

## Implementation

1. Add parser schema for top-level `profiles` and generated JSON schema support.
2. Add a deployment-config helper that applies a selected profile or returns a stable domain error
   when the profile is missing.
3. Update CLI deploy to accept `--config-profile`, apply the selected profile before preview
   overlays, and keep flags as final overrides.
4. Update GitHub Action metadata/script to pass `config-profile` to CLI and server config deploy.
5. Update Action server config deploy body handling to apply the selected profile server-side.
6. Add parser, CLI, Action wrapper, and server config deploy tests.

## Operation Catalog

No new operation key. This is a repository config workflow/profile extension over existing
Resource profile, Resource access, Resource health, runtime monitoring threshold, and environment
variable operations.

## Compatibility

Pre-1.0 additive config and CLI/Action input. Existing configs without `profiles` are unchanged.
Unknown or unsafe fields remain rejected.

## Test Strategy

- Parser/schema tests bind `CONFIG-FILE-NAMED-PROFILE-001` and
  `CONFIG-FILE-NAMED-PROFILE-002`.
- CLI workflow tests bind `CONFIG-FILE-NAMED-PROFILE-003` through
  `CONFIG-FILE-NAMED-PROFILE-006`.
- Action wrapper tests prove `config-profile` maps to CLI.
- Action server config deploy HTTP tests prove server-side profile selection.
