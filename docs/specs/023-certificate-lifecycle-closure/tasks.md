# Tasks: Certificate Lifecycle Closure

## Test-First

- [x] ROUTE-TLS-CMD-024: add core/application test for provider-issued certificate show.
- [x] ROUTE-TLS-CMD-025: add application test for public certificate retry creating a new attempt.
- [x] ROUTE-TLS-CMD-026: add application test for imported certificate retry rejection.
- [x] ROUTE-TLS-CMD-027: add application test for provider-issued certificate revoke.
- [x] ROUTE-TLS-CMD-028: add application test for imported certificate revoke.
- [x] ROUTE-TLS-CMD-029: add application test for guarded certificate delete.
- [x] ROUTE-TLS-ENTRY-026..029: add CLI/API/Web entrypoint coverage.

## Source Of Truth

- [x] Add ADR-035.
- [x] Add certificate lifecycle feature artifact.
- [x] Update operation map, core operations, domain model, workflow, errors, and test matrix.
- [x] Add command/query specs and lifecycle event specs.
- [x] Update public docs/help anchors.

## Implementation

- [x] Implement certificate aggregate transitions for retry admission, revoke, and delete.
- [x] Implement show query.
- [x] Implement retry/revoke/delete use cases, handlers, schemas, and operation catalog entries.
- [x] Implement provider/secret-store revoke/deactivate boundaries.
- [x] Update persistence/read models for safe show/readback.

## Entrypoints And Docs

- [x] Update oRPC/OpenAPI routes and typed client.
- [x] Update CLI certificate subcommands.
- [x] Update Web resource certificate affordances and i18n keys.
- [x] Update public certificate docs.

## Verification

- [x] Run targeted core tests.
- [x] Run targeted application tests.
- [x] Run targeted persistence/read-model tests.
- [x] Run targeted shell e2e/API/CLI tests.
- [x] Run targeted Web tests.
- [x] Run `bun run typecheck`.
- [x] Run `bun run lint`.

## Post-Implementation Sync

- [x] Reconcile specs, plan, tasks, tests, docs, operation catalog, and roadmap.
- [x] Record remaining Phase 6 gaps.
