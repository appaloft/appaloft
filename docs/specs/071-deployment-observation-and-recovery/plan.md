# Plan: Deployment Observation And Recovery Hardening

## Governing Sources

- Roadmap: [Product Roadmap To 1.0.0](../../PRODUCT_ROADMAP.md)
- Operation map: [Business Operation Map](../../BUSINESS_OPERATION_MAP.md)
- Operation catalog docs: [Core Operations](../../CORE_OPERATIONS.md)
- Decisions/ADRs:
  - [ADR-016: Deployment Command Surface Reset](../../decisions/ADR-016-deployment-command-surface-reset.md)
  - [ADR-029: Deployment Event Stream And Recovery Boundary](../../decisions/ADR-029-deployment-event-stream-and-recovery-boundary.md)
  - [ADR-034: Deployment Recovery Readiness](../../decisions/ADR-034-deployment-recovery-readiness.md)
- Global contracts:
  - [Async Lifecycle And Acceptance](../../architecture/async-lifecycle-and-acceptance.md)
  - [Error Model](../../errors/model.md)
- Local specs:
  - [deployments.stream-events](../../queries/deployments.timeline.md)
  - [deployments.recovery-readiness](../../queries/deployments.recovery-readiness.md)
  - [deployments.retry](../../commands/deployments.retry.md)
  - [deployments.redeploy](../../commands/deployments.redeploy.md)
  - [deployments.rollback](../../commands/deployments.rollback.md)
  - [Deployment Detail And Observation](../../workflows/deployment-detail-and-observation.md)
- Test matrices:
  - [Deployment Event Stream Test Matrix](../../testing/deployment-timeline-journal-test-matrix.md)
  - [Deployment Recovery Readiness Test Matrix](../../testing/deployment-recovery-readiness-test-matrix.md)
  - [Public Documentation Test Matrix](../../testing/public-documentation-test-matrix.md)

## Architecture Approach

- Domain/application placement: no new domain model in the first hardening slice. Keep observation in
  query services and recovery admission in existing command/use-case boundaries.
- Repository/specification/visitor impact: none expected for the first event-stream hardening slice.
  If a test reveals missing retained event or rollback candidate persistence, return to the owning
  implementation plan before changing persistence.
- Event/CQRS/read-model impact: strengthen read-side stream behavior and tests. Do not add write
  behavior or let query handlers mutate deployment state.
- Entrypoint impact: API/oRPC streaming, CLI follow/cancel, and Web timeline reconnect are the first
  hardening surfaces. Retry/redeploy/rollback edge-case tests are now part of the same completed
  hardening round.
- Persistence/migration impact: none for the first slice unless cursor/gap tests prove the retained
  event observation store lacks required evidence; then update ADR-059-governed retention specs
  before code.

## Roadmap And Compatibility

- Roadmap target: `0.12.x` patch hardening before the `1.0.0-rc` gate.
- Version target: next `0.12.x` patch, not `1.0.0-rc`.
- Compatibility impact: `pre-1.0-policy`, backward-compatible hardening of active public surfaces.
- Release-note requirement: mention deployment event-stream reconnect/gap/CLI hardening and recovery
  coverage if code changes ship.
- Migration requirement: no user migration expected for the first hardening slice.

## Completed Priority Order

1. Hardened `deployments.stream-events` reconnect/gap/CLI coverage.
2. Hardened active `deployments.retry` and `deployments.redeploy` edge-case coverage.
3. Originally decided public `deployments.cancel` was not required for this blocker; the later
   pre-RC closure round pulled it forward through a separate governed command/workflow/error/test
   matrix and executable evidence.
4. Hardened rollback candidate/readiness coverage for incompatible target/destination candidates.

`deployments.retry`, `deployments.redeploy`, and `deployments.rollback` are already active. The plan
uses "harden" for these operations, not "rebuild from zero".

## Testing Strategy

- First Code Round matrix ids:
  - `DEP-EVENTS-QRY-004`
  - `DEP-EVENTS-QRY-005`
  - `DEP-EVENTS-QRY-007`
  - `DEP-EVENTS-QRY-008`
  - `DEP-EVENTS-STREAM-002`
  - `DEP-EVENTS-STREAM-003`
  - `DEP-EVENTS-STREAM-004`
  - `DEP-EVENTS-STREAM-005`
  - `DEP-EVENTS-STREAM-006`
  - `DEP-EVENTS-OWN-001` through `DEP-EVENTS-OWN-004`
  - `DEP-EVENTS-ENTRY-003`
- Second Code Round matrix ids:
  - `DEP-RECOVERY-READINESS-003`
  - `DEP-RECOVERY-READINESS-005`
  - `DEP-RETRY-002`
  - `DEP-RETRY-003`
  - `DEP-RETRY-004`
  - `DEP-REDEPLOY-002`
  - `DEP-REDEPLOY-003`
  - `DEP-REDEPLOY-004`
- Rollback hardening ids:
  - `DEP-RECOVERY-READINESS-008`
  - backend-specific artifact retention/prune-horizon rows remain deferred until their owning specs
    define additional evidence.
- Docs/help rows:
  - `PUB-DOCS-002`
  - `PUB-DOCS-003`
  - `PUB-DOCS-005`
  - `PUB-DOCS-016`

## Risks And Migration Gaps

- Retained event observation may not cover every non-domain progress envelope across process
  restart; the first slice must emit explicit gaps instead of promising continuity it cannot prove.
- CLI cancellation can be transport/runtime-specific; tests should assert cleanup and exit behavior
  without requiring a real long-running deployment target.
- Recovery edge cases stay in recovery command use cases and readiness query services, not Web/CLI
  button logic.
- Cancel is now a separate active public command under `deployments.cancel`. Do not smuggle broader
  cancel/delete/reattach semantics through stream cancellation, operator-work cancel,
  cleanup-preview, or supersede behavior.
