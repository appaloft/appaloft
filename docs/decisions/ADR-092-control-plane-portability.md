# ADR-092: Control-Plane Portability

Status: Accepted

Date: 2026-07-20

## Context

Remote-state maintenance protects one SSH/PGlite state root, but users need a portable,
user-controlled export/import contract across self-hosted, Cloud, and licensed distributions.
Database file copying is not a stable published language and can expose secret material.

## Decision

Appaloft publishes `appaloft.control-plane-portability/v1`, an encrypted artifact envelope whose
payload contains a schema-versioned table manifest and whose durable readback contains no secret
values or passphrase. The complete payload is authenticated and encrypted with a caller-provided
passphrase; external provider resources are represented only by Appaloft references and intent.

Public operations are `control-plane-portability.export-plan`, `export`, `import-plan`, `import`,
`artifacts.list`, `artifacts.show`, and `artifacts.delete`. Export/import plans are dry-run queries.
Import supports `merge` and `replace`. `replace` requires explicit destructive acknowledgement.

The persistence adapter owns schema discovery, compatibility checks, transactional import, write
locking, rollback snapshot creation, and tenant-safe filtering. The artifact provider owns bytes,
checksum verification, and cleanup. A failed import rolls back its database transaction and keeps
the rollback artifact. A successful import exposes the rollback reference until the operator
explicitly deletes it.

Passphrases, decrypted payloads, provider credentials, and secret column values must never appear
in logs, errors, audit details, read models, URLs, or operation metadata.

## Consequences

- Portability is a public contract, not a provider- or database-specific UI shortcut.
- Cloud may supply managed encrypted artifact custody while Community supplies local custody.
- Import is observable and recoverable; cleanup is explicit and checksum guarded.

## Governed Specs

- [Control-Plane Portability](../specs/109-control-plane-portability/spec.md)
- [Control-Plane Portability Test Matrix](../testing/control-plane-portability-test-matrix.md)
- [Control-Plane Modes](./ADR-025-control-plane-modes-and-action-execution.md)
