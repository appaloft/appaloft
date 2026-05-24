# Repository Config Dependency Graph Tasks

## Documentation

- [x] Add ADR-066.
- [x] Add spec, plan, and tasks artifacts.
- [x] Update workflow and cleanup command specs.
- [x] Update deployment-config and dependency-resource test matrices.
- [x] Update public config-file and dependency docs.

## Implementation

- [x] Add `dependencies` parser/schema and regenerate JSON schema.
- [x] Add dependency declarations to deployment prompt seed.
- [x] Add idempotent CLI config dependency orchestration.
- [x] Persist source-link dependency provenance.
- [x] Extend preview cleanup to unbind/delete provenance-owned ephemeral dependencies.

## Tests

- [x] Parser accepts canonical managed dependency kinds and rejects unknown fields.
- [x] CLI config deploy dispatches kind-specific list/provision/bind for Redis as well as Postgres.
- [x] CLI config deploy dispatches list/provision/bind before deployment create.
- [x] CLI config deploy is idempotent with existing resource and binding.
- [x] CLI config deploy reports stable conflict for mismatched env target binding.
- [x] CLI preview config deploy rejects unprovenanced ephemeral dependency reuse.
- [x] CLI preview config deploy fails before mutation when provenance storage is unavailable.
- [x] Preview cleanup deletes only provenance-owned ephemeral dependencies.
- [x] Preview cleanup preserves manual/shared dependencies without provenance.
