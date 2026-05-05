# Resource Runtime Controls

## Status

Spec Round for Phase 7 / `0.9.0`.

This artifact positions Resource runtime stop/start/restart before Code Round. It does not activate
new commands, HTTP routes, Web actions, or runtime adapter capabilities.

## Governing Sources

- [ADR-038: Resource Runtime Control Ownership](../../decisions/ADR-038-resource-runtime-control-ownership.md)
- [Business Operation Map](../../BUSINESS_OPERATION_MAP.md)
- [Resource Runtime Controls Test Matrix](../../testing/resource-runtime-controls-test-matrix.md)
- [Resource Runtime Controls Implementation Plan](../../implementation/resource-runtime-controls-plan.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-018: Resource Runtime Log Observation](../../decisions/ADR-018-resource-runtime-log-observation.md)
- [ADR-023: Runtime Orchestration Target Boundary](../../decisions/ADR-023-runtime-orchestration-target-boundary.md)
- [ADR-028: Command Coordination Scope And Mutation Admission](../../decisions/ADR-028-command-coordination-scope-and-mutation-admission.md)

## Problem

Operators need to stop, start, or restart a currently deployed Resource without creating a new
deployment attempt. That behavior must not be confused with redeploy, retry, rollback, profile
editing, runtime log observation, or server cleanup.

## Candidate Operations

| Operation | Kind | Owner | Intent |
| --- | --- | --- | --- |
| `resources.runtime.stop` | Accepted candidate command | Resource runtime control application service | Stops the current runtime instance for one Resource placement without deleting Resource or deployment state. |
| `resources.runtime.start` | Accepted candidate command | Resource runtime control application service | Starts the last stopped runtime instance from retained safe runtime metadata. |
| `resources.runtime.restart` | Accepted candidate command | Resource runtime control application service | Performs stop then start over the current runtime instance without re-planning or rebuilding. |

The first Code Round may implement these operations through one shared application service and one
runtime target control port, but each public command must keep a distinct operation key and command
schema.

## Business Semantics

Runtime controls affect current runtime process state only. They do not:

- create a new Deployment attempt;
- re-run detect or plan;
- rebuild or pull a new artifact;
- refresh source or environment variables;
- apply Resource source/runtime/network/access/health profile edits;
- attach/detach storage or bind/unbind dependencies;
- modify domain/TLS/certificate state;
- rewrite historical deployment snapshots;
- delete runtime artifacts, backups, logs, or audit state.

Users who want source/config/profile changes to take effect should use `deployments.redeploy` or a
new ordinary deployment path after readiness permits it.

## Admission Semantics

Runtime control commands must:

1. Validate command input.
2. Resolve one Resource and current or retained runtime placement.
3. Reject archived or deleted Resources.
4. Reject when no safe current or retained runtime metadata exists.
5. Reject when another `resource-runtime` mutation is active for the same placement.
6. Persist a runtime-control attempt/read-model record before adapter execution.
7. Execute through a provider-neutral runtime target control port.
8. Record success, failed, or blocked outcome with safe diagnostics.
9. Return the runtime-control attempt id and current observed state.

`resources.runtime.start` additionally requires stopped or safely startable retained runtime
metadata. `resources.runtime.restart` requires a currently running or startable runtime instance and
must report whether stop succeeded but start failed.

## Read And Recovery Surface

The first Code Round may expose control attempt status through one of:

- `resources.show` runtime summary;
- `resources.health`;
- a future `resources.runtime-control.show` query if attempt history needs independent pagination.

Before Code Round, decide the read surface in local query specs and update public docs/help anchors.

Failures should guide users to:

- inspect `resources.health` for current runtime status;
- inspect `resources.runtime-logs` for application output when the instance is running or recently
  ran;
- run `deployments.recovery-readiness` when a new deployment, retry, redeploy, or rollback is more
  appropriate than start/restart.

## Acceptance Criteria

| ID | Scenario | Expected result |
| --- | --- | --- |
| `RUNTIME-CTRL-SPEC-001` | Stop running Resource runtime. | Stop attempt is recorded and runtime observation becomes stopped or failed with safe details. |
| `RUNTIME-CTRL-SPEC-002` | Start stopped Resource runtime with retained metadata. | Start attempt is recorded and runtime observation becomes running or failed with safe details. |
| `RUNTIME-CTRL-SPEC-003` | Restart running Resource runtime. | One restart attempt records stop/start phases without creating a Deployment attempt. |
| `RUNTIME-CTRL-SPEC-004` | Runtime metadata is missing or stale. | Command is blocked and suggests redeploy or recovery readiness. |
| `RUNTIME-CTRL-SPEC-005` | Deployment is active for same Resource runtime scope. | Runtime control is blocked or times out through `resource-runtime` coordination. |
| `RUNTIME-CTRL-SPEC-006` | Resource profile changed after last deployment. | Restart/start still use retained runtime metadata and do not apply profile changes. |

## Public Surfaces

Future Code Round must synchronize:

- CLI commands for runtime stop/start/restart;
- HTTP/oRPC routes using the same command schemas;
- Web Resource detail affordances showing clear stop/start/restart versus redeploy language;
- public docs/help anchors explaining runtime controls, blocked start, and restart versus redeploy;
- future MCP/tool descriptors generated from operation catalog metadata.

## Remaining Work Before Code Round

- Add local command specs for `resources.runtime.stop`, `resources.runtime.start`, and
  `resources.runtime.restart`.
- Add error spec and stable blocked reason vocabulary.
- Decide whether attempt readback belongs in `resources.show`, `resources.health`, or a new query.
- Bind test matrix rows to automated command/use-case, adapter, CLI/HTTP, and Web tests.
- Update `CORE_OPERATIONS.md` and `operation-catalog.ts` only when activating the operations.
