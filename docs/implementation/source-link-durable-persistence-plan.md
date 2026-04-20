# Source Link Durable Persistence Implementation Plan

## Scope

This plan covers the PostgreSQL/PGlite persistence slice for source link state.

It does not add a new public operation. The active command remains `source-links.relink`, and
regular config deploys may continue to create or reuse source links through the existing
`SourceLinkStore` port.

## Governing Specs

- [ADR-024: Pure CLI SSH State And Server-Applied Domains](../decisions/ADR-024-pure-cli-ssh-state-and-server-applied-domains.md)
- [ADR-025: Control-Plane Modes And Action Execution](../decisions/ADR-025-control-plane-modes-and-action-execution.md)
- [source-links.relink Command Spec](../commands/source-links.relink.md)
- [resources.delete Command Spec](../commands/resources.delete.md)
- [Source Link State Test Matrix](../testing/source-link-state-test-matrix.md)
- [Resource Profile Lifecycle Test Matrix](../testing/resource-profile-lifecycle-test-matrix.md)
- [Repository Deployment Config File Bootstrap](../workflows/deployment-config-file-bootstrap.md)

## Code Round Target

The next Code Round should make source link state durable in the selected PostgreSQL-compatible
state backend.

The minimum coherent slice is:

1. Add a `source_links` migration in `packages/persistence/pg`:
   - `source_fingerprint` primary key;
   - project/environment/resource required references;
   - optional server/destination references;
   - `updated_at`, optional `reason`, and safe JSON metadata;
   - an index on `resource_id` for deletion blocker reads;
   - no cascade that can erase source link identity when a resource is deleted or tombstoned.
2. Add a PG `SourceLinkStore` adapter in `packages/persistence/pg`.
3. Register the PG adapter in shell composition whenever the selected database backend is
   PostgreSQL/PGlite and no SSH remote-state file mirror has been explicitly selected for the
   command.
4. Keep SSH remote-state file stores for transfer/mirror mechanics, but ensure command execution
   reads and writes through the selected Appaloft state backend.
5. Extend `PgResourceDeletionBlockerReader` so `source_links.resource_id = resourceId` reports a
   `source-link` blocker.
6. Keep API/oRPC and Web relink entrypoints deferred; this slice is persistence and blocker
   closure, not a new surface.

## Tests

The Code Round must cover:

- `SOURCE-LINK-STATE-015`: PG source link store persists and reads mappings.
- `SOURCE-LINK-STATE-016`: PG relink is idempotent and guard conflicts preserve existing rows.
- `SOURCE-LINK-STATE-017`: `resources.delete` rejects an archived resource with a PG source-link
  blocker.
- `SOURCE-LINK-STATE-018`: migration shape supports reverse lookup and does not define an unsafe
  cascade from resource deletion to source links.

Existing tests for CLI file-backed source link state must remain valid. The new PG tests should
prefer PGlite integration coverage so the migration and Kysely adapter are exercised without a
required external Postgres URL.

## Current Implementation Notes And Migration Gaps

CLI SSH mode currently persists source links through file-backed remote-state mirror files.

PG/PGlite source-link persistence is not implemented yet. Because there is no `source_links` table,
`resources.delete` currently cannot detect `source-link` blockers from PG state. The blocker kind
is already part of the normative delete contract; this plan defines the missing durable source.

API/oRPC and Web surfaces for reviewing or relinking source links remain future work after this
persistence slice.
