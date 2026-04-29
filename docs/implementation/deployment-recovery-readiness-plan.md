# Deployment Recovery Readiness Implementation Plan

## Status

Spec Round implementation plan. No code is implemented by this document.

## Governing Sources

- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-034: Deployment Recovery Readiness](../decisions/ADR-034-deployment-recovery-readiness.md)
- [Deployment Recovery Readiness Spec](../specs/012-deployment-recovery-readiness/spec.md)
- [Deployment Recovery Readiness Plan](../specs/012-deployment-recovery-readiness/plan.md)
- [Deployment Recovery Readiness Tasks](../specs/012-deployment-recovery-readiness/tasks.md)
- [Deployment Recovery Readiness Test Matrix](../testing/deployment-recovery-readiness-test-matrix.md)

## Code Round Order

### 1. Readiness Query Slice

- Add application-level recovery policy/read model service that depends on deployment repositories
  and read models, not on transport code.
- Add `deployments.recovery-readiness` query input/output schema and operation-catalog entry.
- Read durable deployment status, immutable deployment snapshot, environment snapshot, runtime
  target/destination identity, artifact identity, and resource runtime coordination state.
- Return stable blocked reason codes and safe next actions without admitting recovery work.
- Wire HTTP/oRPC, CLI inspection, Web detail consumption, and future MCP/tool-compatible schema only
  after application tests pass.

### 2. Retry Command Slice

- Add `deployments.retry` command and handler after readiness query is active.
- Re-evaluate readiness server-side and create a new attempt from retained snapshot intent.
- Persist normal deployment lifecycle state with recovery metadata `triggerKind = "retry"` and
  `sourceDeploymentId`.
- Reject stale or blocked decisions with recovery admission errors.

### 3. Redeploy Command Slice

- Add `deployments.redeploy` command and handler after retry semantics are covered.
- Resolve current Resource profile exactly as deployment admission does.
- Create a new attempt from current desired state and avoid any fallback to old snapshot retry.
- Coordinate on `resource-runtime` with create/retry/rollback.

### 4. Rollback Command Slice

- Add `deployments.rollback` command and handler only after retained artifact/snapshot fixtures are
  executable.
- Create a new rollback attempt from the selected successful candidate's retained snapshot and
  Docker/OCI artifact identity.
- Reject missing candidate, expired retention, incompatible target, or unsupported stateful data
  rollback with stable recovery error codes.

### 5. Entrypoints And Docs Slice

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
