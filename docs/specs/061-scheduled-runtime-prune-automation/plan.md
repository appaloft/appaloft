# Plan: Scheduled Runtime Prune Automation

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: ADR-023, ADR-034, ADR-047, ADR-050, ADR-054, ADR-055
- Global contracts:
  - `docs/architecture/async-lifecycle-and-acceptance.md`
  - `docs/architecture/adapter-command-query-boundary.md`
  - `docs/errors/model.md`
  - `docs/errors/neverthrow-conventions.md`
- Local specs:
  - `docs/specs/055-runtime-artifact-workspace-prune/spec.md`
  - `docs/commands/servers.capacity.prune.md`
  - `docs/specs/060-durable-process-delivery-baseline/spec.md`
- Test matrix: `docs/testing/runtime-target-capacity-test-matrix.md`

## Architecture Approach

- Domain/application placement: policy selection, scheduled run admission, command dispatch, and
  retry/failure translation belong in `packages/application`. Shell composition may host the tick
  loop but must dispatch through `CommandBus`/`QueryBus` and injected ports.
- Repository/specification/visitor impact: Code Round added a retention policy read model and
  resolver port with PostgreSQL/PGlite persistence in `packages/persistence/pg`.
- Event/CQRS/read-model impact: scheduled prune is command-side maintenance. It creates durable
  process attempts, dispatches `PruneServerCapacityCommand`, and reports status through
  `operator-work.*`. Query surfaces must not mutate retention state.
- Entrypoint impact: no new public prune command is required in the first slice. Policy
  configure/list/show commands and queries are active in `CORE_OPERATIONS.md` and
  `operation-catalog.ts`.
- Persistence/migration impact: policy storage, migrations, and PGlite tests are implemented for
  persisted scheduled runtime prune policy records, including `deployment-snapshot` scope.

## Roadmap And Compatibility

- Roadmap target: Phase 9 operator/internal state closure for `0.11.0`.
- Version target: pre-1.0 policy.
- Compatibility impact: additive internal automation and possible additive policy/readback fields.
  Destructive scheduled prune must remain disabled without explicit policy enablement.

## Testing Strategy

- Matrix ids: `RT-CAP-SCHED-001` through `RT-CAP-SCHED-007`.
- Test-first rows:
  - policy precedence and masked readback;
  - dry-run default dispatch;
  - destructive policy-gated dispatch;
  - durable process attempt creation before worker execution;
  - retry/failure/dead-letter visibility;
  - audit row reuse for destructive deletion;
  - CQRS boundary tests for shell scheduler and any public policy entrypoint.
- Acceptance/e2e: focused shell runner test for due policy tick to command-bus dispatch and
  operator-work visibility.
- Contract/integration/unit: application policy resolver tests, persistence policy tests if storage
  is introduced, and runtime prune command reuse tests.

## Risks And Governed Follow-Ups

- Policy source and persistence are implemented for configured policy records, including
  `deployment-snapshot` scope.
- Repository/deployment-snapshot config materialization is implemented for `retention.runtimePrune`
  in Appaloft deployment config. It writes the existing scheduled runtime prune policy record shape
  for the selected target and does not widen scheduled prune beyond runtime target capacity cleanup.
- The implemented worker avoids broad retention automation for audit/events/logs; those boundaries
  are governed by their own scheduler specs.
