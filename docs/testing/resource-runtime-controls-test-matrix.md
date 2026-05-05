# Resource Runtime Controls Test Matrix

## Status

Application, persistence, and runtime adapter slices for Phase 7 / `0.9.0`.

Runtime stop/start/restart command schemas, handlers, use case orchestration, coordination
policies, provider-neutral target port contract, attempt-recorder contract, PG/PGlite attempt
persistence/readback, Docker/Compose adapter command mapping, local/generic-SSH executor wiring,
and shell-internal DI registrations exist. No runtime stop/start/restart operation is active in
CLI, HTTP/oRPC, Web, `CORE_OPERATIONS.md`, or `operation-catalog.ts` yet.

## Governing Sources

- [ADR-038: Resource Runtime Control Ownership](../decisions/ADR-038-resource-runtime-control-ownership.md)
- [Resource Runtime Controls](../specs/043-resource-runtime-controls/spec.md)
- [resources.runtime.stop Command Spec](../commands/resources.runtime.stop.md)
- [resources.runtime.start Command Spec](../commands/resources.runtime.start.md)
- [resources.runtime.restart Command Spec](../commands/resources.runtime.restart.md)
- [Resource Runtime Controls Error Spec](../errors/resource-runtime-controls.md)
- [resources.health Query Spec](../queries/resources.health.md)
- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [ADR-018: Resource Runtime Log Observation](../decisions/ADR-018-resource-runtime-log-observation.md)
- [ADR-023: Runtime Orchestration Target Boundary](../decisions/ADR-023-runtime-orchestration-target-boundary.md)
- [ADR-028: Command Coordination Scope And Mutation Admission](../decisions/ADR-028-command-coordination-scope-and-mutation-admission.md)
- [Deployment Recovery Readiness Test Matrix](./deployment-recovery-readiness-test-matrix.md)

## Command Coverage

| ID | Scenario | Expected assertion | Automation binding | Status |
| --- | --- | --- | --- | --- |
| `RUNTIME-CTRL-STOP-001` | Running Resource runtime receives stop. | Stop attempt is persisted and adapter receives normalized stop request. | `packages/application/test/resource-runtime-control.test.ts` | Application slice passing; real adapter deferred |
| `RUNTIME-CTRL-START-001` | Stopped Resource runtime has retained metadata. | Start attempt is persisted and adapter receives normalized start request without deployment creation. | `packages/application/test/resource-runtime-control.test.ts` | Application slice passing; real adapter deferred |
| `RUNTIME-CTRL-RESTART-001` | Running Resource runtime receives restart. | Restart attempt records stop/start phases and does not create a Deployment attempt. | `packages/application/test/resource-runtime-control.test.ts` | Application slice passing; real adapter deferred |
| `RUNTIME-CTRL-BLOCK-001` | Runtime metadata is missing or stale. | Command returns stable blocked reason and suggests redeploy or recovery readiness. | `packages/application/test/resource-runtime-control.test.ts` | Passing |
| `RUNTIME-CTRL-COORD-001` | Deployment or recovery mutation is active for same resource-runtime scope. | Runtime control is blocked or returns coordination timeout without adapter execution. | `packages/application/test/resource-runtime-control.test.ts` | Passing |

## Readback Coverage

| ID | Scenario | Expected assertion | Automation binding | Status |
| --- | --- | --- | --- | --- |
| `RUNTIME-CTRL-READ-001` | Latest runtime-control attempt exists for a Resource. | `resources.health` returns `latestRuntimeControl` with operation, status, runtime state, phase details when applicable, safe error code, and blocked reason without raw provider details. | `packages/application/test/resource-health.test.ts`; `packages/contracts/test/route-intent-status-contract.test.ts`; `packages/persistence/pg/test/resource-runtime-control-attempts.pglite.test.ts` | Passing |

## Adapter Coverage

| ID | Scenario | Expected assertion | Automation binding | Status |
| --- | --- | --- | --- | --- |
| `RUNTIME-CTRL-ADAPTER-001` | Single-server Docker runtime control. | Adapter maps normalized stop/start/restart to Docker behavior without leaking Docker ids into public input. | `packages/adapters/runtime/test/resource-runtime-control-target.test.ts` | Passing |
| `RUNTIME-CTRL-ADAPTER-002` | Compose runtime control. | Adapter scopes service/project control safely and reports sanitized details. | `packages/adapters/runtime/test/resource-runtime-control-target.test.ts` | Passing |

## Public Surface Coverage

| ID | Scenario | Expected assertion | Automation binding | Status |
| --- | --- | --- | --- | --- |
| `RUNTIME-CTRL-SURFACE-001` | CLI, HTTP/oRPC, Web, and future MCP/tool controls. | Entrypoints reuse the same command schemas, blocked reason vocabulary, and docs links. | planned | Deferred gap |
| `RUNTIME-CTRL-SURFACE-002` | User compares restart and redeploy. | Public docs and UI copy state that restart does not pick up source/config/profile changes. | planned | Deferred gap |
| `RUNTIME-CTRL-DOCS-001` | Public help registry resolves runtime-control anchors. | Registered docs topics resolve `resource-runtime-controls`, `runtime-restart-vs-redeploy`, and `runtime-control-blocked-start` anchors in both locales. | `packages/docs-registry/test/help-topics.test.ts` | Passing |

## Current Implementation Notes And Migration Gaps

Runtime logs and resource health observation are active. Deployment retry, redeploy, and rollback
are active recovery operations. `resources.health` now has a typed optional
`latestRuntimeControl` readback and public runtime-control help anchors have explicit registry
coverage.

Runtime stop/start/restart now has application-layer command schemas, command handlers, a shared
use case, `resource-runtime` coordination policies, a provider-neutral runtime target port
contract, a runtime-control attempt recorder port, PG/PGlite attempt persistence, and
`PgResourceReadModel.latestRuntimeControl` readback. The command/use-case tests use fake target and
recorder collaborators to prove admission, normalized request mapping, attempt record ordering,
phase readback, and coordination scope. The persistence test proves a terminal attempt upserts over
the running attempt and is projected through the Resource read model. The runtime adapter now has
provider-neutral Docker container and Docker Compose command mapping, local shell execution,
generic SSH execution, and sanitized command failure handling behind an injected executor boundary.
Shell composition registers the target port, attempt recorder, use case, and command handlers.
Runtime control remains inactive until CLI/HTTP/Web entrypoints, `CORE_OPERATIONS.md`, and
operation catalog activation slices are aligned.
