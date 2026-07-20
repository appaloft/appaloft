# Imported Dependency Connection Rotation

## Status

- Round: Code Round
- Capability: explicit rotation of Appaloft-stored connection material for imported external dependencies
- Compatibility: additive operation; existing dependency identity and bindings are preserved

## Outcome

An operator can replace an expired, reset, or incorrect external database connection without
deleting and recreating the dependency resource. The operation preserves the dependency resource
id, Appaloft-owned secret reference, bindings, backups, and deployment references while replacing
the protected secret value and masked endpoint metadata.

## Invariants

1. Only active `imported-external` dependency resources may rotate their connection.
2. Appaloft-managed or deleted dependency resources fail before secret storage.
3. Raw connection material enters through the command transport only, is stored by
   `DependencyResourceSecretStore`, and never appears in results, events, read models, diagnostics,
   logs, repository configuration, or deployment snapshots.
4. CLI automation uses `--connection-url-stdin`; argv input remains compatibility-only and the two
   inputs are mutually exclusive.
5. Rotation does not mutate provider-native credentials and does not restart or redeploy consumers.
6. Existing snapshots retain the same safe reference and resolve the newly stored value on a later
   retry/redeploy; the operation does not rewrite historical snapshots.
7. Secret storage occurs before safe resource metadata is persisted. A persistence failure is
   retried with the same idempotent operation and stable secret reference.

## Public Contract

- Operation: `dependency-resources.rotate-connection`
- CLI: `appaloft dependency rotate-connection <dependencyResourceId> --connection-url-stdin`
- HTTP: `POST /api/dependency-resources/{dependencyResourceId}/connection`
- Success: `ok({ id })`
- Event after persistence: `dependency-resource-connection-rotated`

## Surface Scope

- Required: Core, Application, persistence secret store reuse, CLI, HTTP/oRPC, generated SDK,
  operation catalog, public docs, skill guidance, Cloud authorization/admission.
- Deferred: Web form. Operators use CLI/API until a secret-entry UI is separately reviewed.
- Not applicable: `appaloft.yml`; raw credentials are prohibited from repository configuration.

## Acceptance

- Valid imported Postgres/Redis-style connection input updates protected storage and masked metadata.
- Managed, deleted, missing, malformed, and empty-stdin cases fail closed without disclosure.
- Remote CLI sends the exact stdin value only in the typed request body.
- A subsequent safe dependency query proves the new credential works.
