# Plan: Operate And Recover Presentation

## Governing Sources

- ADR-112 and Spec 134.
- Existing ADR-029/034/036/063/083/084/087/091/092 operation boundaries.
- Existing Resource, Deployment, Runtime Monitoring, StorageVolumeBackup, DependencyResourceBackup
  and Control Plane Portability command/query/workflow/error specs.
- `docs/testing/operate-and-recover-test-matrix.md`.

## Architecture Approach

1. Add an adapter-level Operate snapshot coordinator that dispatches existing queries through the
   injected QueryBus abstraction. It owns no repository, aggregate or persistent read model.
2. Add an adapter-level action coordinator that re-reads recovery/restore readiness and dispatches
   only existing commands through the injected CommandBus abstraction.
3. Add `appaloft operate [resourceId]` to the CLI. Local and remote programs use the same command;
   remote dispatch continues through the generated operation catalog and handshake.
4. Add an `OperatePresentation` contract and bounded loopback `operate/v1` protocol. Extend the
   existing Rust/Ratatui binary with an operate module; Bun remains IO/query/command owner.
5. Keep headless JSON generated from the same snapshot DTO. Section failures use safe error
   summaries and never suppress target/admission failures.
6. Add no operation-catalog entry, oRPC route, schema field, database migration or event.

## Entrypoint And Docs Impact

- CLI: additive top-level task entry; existing expert subcommands remain unchanged.
- API/oRPC/SDK/MCP/Web: reuse existing surfaces, no new schema.
- Docs: add task-oriented Operate and Recover section to the existing recovery page, cross-link
  diagnostics, CLI help and generated docs registry coverage.
- Release: additive pre-1.0 public surface and native renderer bundle change.

## Test-First Strategy

- Coordinator unit tests with fake query/command dispatch and stable `OPR-*` ids.
- CLI local/remote/headless tests proving the same operation messages and JSON snapshot.
- Protocol/parser/confirmation/teardown tests for `operate/v1`.
- Rust renderer state/key/confirmation tests and six-platform packaging gates.
- Composed acceptance: failed Deployment -> rollback -> proof and backup -> independent restore ->
  readback -> exact cleanup, using existing public operations.

## Delivery Sequence

1. Merge governance and create one actor-visible public Ticket.
2. RED snapshot/partial/headless/action-admission tests.
3. Implement coordinator and CLI headless path.
4. RED presentation protocol and renderer tests; implement Ratatui operate mode.
5. Add bilingual public docs/help and packaging coverage.
6. Run focused, full public and composed Cloud gates, then final boundary and sync rounds.

## Risks And Mitigations

- Snapshot fan-out latency: dispatch bounded queries concurrently and show per-section progress.
- Stale readiness: re-read immediately before every write and include readiness timestamp/candidate.
- Destructive shortcuts: two-step confirmation and independent restore default.
- Renderer crash: loopback/process teardown and headless parity.
- Scope expansion: no new operation or persistence; platform breadth remains R4.

## Rollback

Remove the additive CLI command, presentation protocol and renderer mode. Existing expert operations,
state, Web/API/SDK/tool surfaces and recovery evidence remain intact.
