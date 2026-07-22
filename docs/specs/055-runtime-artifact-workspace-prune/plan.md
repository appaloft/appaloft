# Plan: Runtime Artifact And Workspace Prune

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: ADR-021, ADR-023, ADR-034, ADR-047
- Local specs: `docs/commands/servers.capacity.prune.md`,
  `docs/workflows/deployment-runtime-target-abstraction.md`
- Test matrix: `docs/testing/runtime-target-capacity-test-matrix.md`

## Architecture Approach

- Domain/application placement: command schema, command, handler, and use case live in
  `packages/application`; the use case loads `DeploymentTarget`, reads a complete server-scoped
  deployment view, derives active-runtime and rollback-candidate protection sets, and delegates
  target mutation plus those sets to a `RuntimeTargetCapacityPruner` port.
- Repository/specification/visitor impact: reuse `ServerRepository.findOne` with
  `DeploymentTargetByIdSpec`; extend `DeploymentReadModel.count/list` with server scoping so the
  application can prove a complete protection view before mutation.
- Event/CQRS/read-model impact: command-side mutation through `CommandBus`; successful destructive
  prune with at least one deleted candidate records one retained audit row through an injected
  application port. No query mutation and no domain event/outbox publication is added in this slice.
- Entrypoint impact: CLI, HTTP/oRPC, and Server detail Web Capacity controls use the command
  schema directly. Web keeps the destructive path behind dry-run preview and explicit confirmation.
- Persistence/migration impact: none.

## Roadmap And Compatibility

- Roadmap target: Phase 9 operator state closure for `0.11.0`.
- Version target: pre-1.0 policy; new public CLI/API capability.
- Compatibility impact: additive command and response schema; destructive behavior requires
  explicit `dryRun = false`.

## Testing Strategy

- Matrix ids: `RT-CAP-PRUNE-001` through `RT-CAP-PRUNE-013` plus `RT-CAP-WEB-001`.
- Test-first rows: application use case, CLI dispatch, oRPC route, runtime adapter parser/script
  coverage.
- Acceptance/e2e: focused CLI/oRPC tests prove command bus dispatch and shared schema; Bun.WebView
  coverage proves Monitor-to-Capacity handoff, dry-run-first Web dispatch, and inherited cutoff.
- Contract/integration/unit: application command schema and runtime adapter parse/delete intent
  tests prove safety exclusions.

## Follow-On Extension

- ADR-050 extends the command with explicit opt-in `docker-build-cache` and `unused-images`
  categories. They are not default categories; operators must request them explicitly.
- Runtime adapters use Docker filtered prune commands (`until=<before>`) and never run broad
  `docker system prune` or Docker volume prune.

## Risks And Migration Gaps

- Audit row recording is limited to the destructive prune outcome. Scheduled runtime prune
  automation, audit export, and legal-hold policy are separate implemented Phase 9 slices. Event
  stream/outbox publication remains outside this runtime artifact prune boundary.
- The runtime adapter must prefer skipped diagnostics over deletion when ownership evidence is
  incomplete.
