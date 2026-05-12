# Tasks: Organization Retention Defaults

## Spec Round

- [x] Add ADR-060 and decision index entry.
- [x] Add `docs/specs/066-organization-retention-defaults/` feature artifacts.
- [x] Position retention defaults in `docs/BUSINESS_OPERATION_MAP.md`.
- [x] Add `docs/testing/organization-retention-defaults-test-matrix.md`.
- [x] Keep roadmap audit/event retention item open until implementation and verification exist.

## Test-First

- [x] ORG-RETENTION-DEFAULTS-001: add application and persistence tests for configuring safe
  category defaults without executing prune work.
- [x] ORG-RETENTION-DEFAULTS-002: add application and persistence tests for list/show safe
  readback.
- [x] ORG-RETENTION-DEFAULTS-003: add tests proving manual prune commands do not infer cutoff or
  destructive behavior from defaults.
- [x] ORG-RETENTION-DEFAULTS-004: add tests proving category-specific guards remain authoritative
  for later scheduled consumers.
- [x] ORG-RETENTION-DEFAULTS-005: add CLI and HTTP/oRPC shared schema dispatch tests when
  entrypoints enter scope.

## Implementation

- [x] Add shared retention default category and policy schema.
- [x] Add command/query messages, handlers, and use case/query services for configure/list/show.
- [x] Add application ports for retention default repository/read model.
- [x] Add PostgreSQL/PGlite persistence boundary and migration.
- [x] Wire shell composition tokens.
- [x] Add CLI `appaloft retention-default configure/list/show` commands.
- [x] Add HTTP/oRPC routes.
- [x] Add operation catalog entries and docs registry coverage.
- [x] Add OpenAPI and SDK metadata coverage.

## Entrypoints And Docs

- [x] Add public docs/help anchor for retention defaults.
- [x] Keep Web as future operator maintenance surface unless a governed UI slice is in scope.

## Verification

- [x] Run focused application and persistence tests.
- [x] Run docs-registry, operation catalog, and OpenAPI boundary tests after catalog entries entered
  scope.
- [x] Run CLI and oRPC tests after those surfaces entered
  scope.
- [x] Run touched typecheck.
- [x] Run `git diff --check`.

## Post-Implementation Sync

- [x] Reconcile ADR-060, feature artifacts, local command/query specs, test matrix, roadmap,
  operation map, core operations, docs/help, code, tests, and remaining migration gaps.
