# Deployment Recovery Readiness Implementation Plan

## Status

Readiness query Code Round implemented. Retry and redeploy command slices are active. Rollback
remains a future command slice scoped by
[Deployment Rollback](../specs/041-deployment-rollback/spec.md).

## Governing Sources

- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-034: Deployment Recovery Readiness](../decisions/ADR-034-deployment-recovery-readiness.md)
- [Deployment Recovery Readiness Spec](../specs/012-deployment-recovery-readiness/spec.md)
- [Deployment Recovery Readiness Plan](../specs/012-deployment-recovery-readiness/plan.md)
- [Deployment Recovery Readiness Tasks](../specs/012-deployment-recovery-readiness/tasks.md)
- [Deployment Recovery Readiness Test Matrix](../testing/deployment-recovery-readiness-test-matrix.md)

## Code Round Order

### 1. Readiness Query Slice

- [x] Add application-level recovery policy/read model service that depends on deployment repositories
  and read models, not on transport code.
- [x] Add `deployments.recovery-readiness` query input/output schema and operation-catalog entry.
- [x] Read durable deployment status, immutable deployment snapshot, environment snapshot, runtime
  target/destination identity, artifact identity, and resource runtime coordination state.
- [x] Return stable blocked reason codes and safe next actions without admitting recovery work.
- [x] Wire HTTP/oRPC, CLI inspection, Web detail consumption, and future MCP/tool-compatible schema only
  after application tests pass.

Current deferred gaps for this slice:

- richer target/destination compatibility checks;
- explicit artifact retention horizon/prune metadata;
- future MCP descriptor;
- full CLI golden-output test beyond type/catalog coverage.

### 2. Retry And Redeploy Command Slice

- Governed by [Deployment Retry And Redeploy](../specs/040-deployment-retry-redeploy/spec.md).
- Add `deployments.retry` and `deployments.redeploy` command slices after readiness query is active.
- Extract or share the deployment attempt execution/terminal-persistence pipeline so create,
  retry, and redeploy do not drift.
- Re-evaluate readiness server-side.
- For retry, create a new attempt from retained snapshot intent and persist recovery metadata
  `triggerKind = "retry"` plus `sourceDeploymentId`.
- For redeploy, create a new attempt from current Resource profile and persist `triggerKind =
  "redeploy"` plus optional source deployment audit context.
- Reject stale or blocked decisions with recovery admission errors.

### 3. Rollback Command Slice

- Add `deployments.rollback` command and handler only after retained artifact/snapshot fixtures are
  executable.
- Create a new rollback attempt from the selected successful candidate's retained snapshot and
  Docker/OCI artifact identity.
- Reject missing candidate, expired retention, incompatible target, or unsupported stateful data
  rollback with stable recovery error codes.

### 4. Entrypoints And Docs Slice

- Web deployment detail shows recovery cards and blocked reasons from readiness output.
- CLI failed-deployment inspection suggests only readiness-backed actions.
- HTTP/oRPC exposes the readiness query and later commands through catalog-backed routes.
- Public docs/help anchors describe retry, redeploy, rollback, blocked reasons, and stream gap
  behavior without DDD/CQRS terminology.

## Non-Goals For First Code Round

- No automatic recovery.
- No stateful data rollback.
- No command that replays events or resumes a failed phase inside an old attempt.
- No separate paginated `deployments.rollback-candidates` query unless readiness output becomes too
  large for the first product use.
