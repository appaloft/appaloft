# Plan: Project Lifecycle Settings Closure

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs:
  `docs/decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md`,
  `docs/decisions/ADR-026-aggregate-mutation-command-boundary.md`,
  `docs/decisions/ADR-030-public-documentation-round-and-platform.md`
- Local specs: `docs/workflows/project-lifecycle.md`, `docs/queries/projects.show.md`,
  `docs/commands/projects.rename.md`, `docs/commands/projects.archive.md`,
  `docs/events/project-renamed.md`, `docs/events/project-archived.md`,
  `docs/errors/projects.lifecycle.md`
- Test matrix: `docs/testing/project-lifecycle-test-matrix.md`,
  `docs/testing/public-documentation-test-matrix.md`

## Architecture Approach

- Domain/application placement: no new domain behavior. Reuse existing Project lifecycle
  operations and value-object backed lifecycle state.
- Repository/specification/visitor impact: none.
- Event/CQRS/read-model impact: no new events. Web composes `projects.show`, resources,
  environments, deployments, and access-route read data as a read-only rollup.
- Entrypoint impact: keep CLI/HTTP/oRPC/Web on existing command/query schemas. Web coverage must
  prove project settings dispatches the existing operation keys and does not create deployments.
- Persistence/migration impact: none.

## Roadmap And Compatibility

- Roadmap target: Phase 4 `0.6.0` Resource Ownership And CRUD Foundation.
- Version target: next feature line after public `v0.5.0`; `0.6.0` remains gated by all Phase 4
  checklist items and exit criteria.
- Compatibility impact: `pre-1.0-policy`, backward-compatible UX/docs/test coverage over existing
  public operations.

## Testing Strategy

- Matrix ids: `PROJ-LIFE-ENTRY-005`, `PROJ-LIFE-ENTRY-006`, and `PROJ-LIFE-ENTRY-007`.
- Test-first rows: WebView project detail/settings read/write dispatch and archived affordance
  guard.
- Acceptance/e2e: `apps/web/test/e2e-webview/home.webview.test.ts`.
- Contract/integration/unit: existing application, CLI, oRPC, operation catalog, and docs registry
  coverage remain the lower-level proof for the same operations.

## Risks And Migration Gaps

- Project description editing, hard delete, restore, and delete-check remain future explicit
  operation candidates, not Phase 4 lifecycle closure blockers.
- Phase 4 release remains blocked until the remaining roadmap items outside this Project lifecycle
  closure are checked.
