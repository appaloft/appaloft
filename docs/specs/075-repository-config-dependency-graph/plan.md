# Repository Config Dependency Graph Plan

## Code Round Plan

1. Extend repository config schema and generated JSON schema with strict `dependencies` support for
   canonical managed dependency kinds, `bind.env`, and preview `ephemeral` lifecycle.
2. Normalize CLI config seed so dependency declarations flow into config deploy without changing
   `deployments.create`.
3. Add CLI orchestration that lists dependency resources and bindings, provisions missing managed
   dependency resources by kind, binds missing env targets, and reports conflicts for mismatched
   active env targets.
4. Persist safe preview dependency provenance on the selected source link after successful
   provision/bind.
5. Extend PG/PGlite and file-backed source-link state to retain dependency provenance metadata.
6. Extend `deployments.cleanup-preview` to clean only provenance-marked ephemeral dependencies
   through existing unbind/delete use cases.
7. Update workflow specs, command spec, test matrices, and public docs.
8. Add targeted tests for config parser/schema, CLI config deploy orchestration/idempotency/conflict,
   and preview cleanup safety.

## Boundary Checks

- `deployments.create` remains ids-only.
- CLI uses only CommandBus/QueryBus for dependency operations.
- Cleanup uses existing application use cases and delete blockers rather than repository shortcuts.
- Config fields are user-facing application dependency graph fields, not internal object dumps.
- `controlPlane.install.database` remains separate Appaloft control-plane install configuration.
