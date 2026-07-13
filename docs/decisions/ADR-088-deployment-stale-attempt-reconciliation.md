# ADR-088: Deployment Stale Attempt Reconciliation

Status: Accepted

## Context

A deployment attempt can remain non-terminal after the process or worker that owned execution
stops before persisting a terminal result. An active-row uniqueness guard then blocks later
deployments for the Resource even though no executor is still making progress. Treating every old
attempt as failed or canceled is unsafe: elapsed time alone does not prove that runtime work stopped,
and cancel is an explicit operator intent rather than crash recovery.

## Decision

- `Deployment` owns a new terminal status, `interrupted`, for an attempt whose execution ownership
  was lost and whose durable activity stayed unchanged beyond an explicit stale threshold.
- Durable activity is the latest of `createdAt`, `startedAt`, and persisted Deployment Timeline
  Journal timestamps. Log text is never parsed as policy.
- `deployments.stale-attempts` is a bounded read-only query. It returns candidate status, latest
  activity, stale duration, threshold, and an opaque `stateVersion` derived from durable attempt
  state.
- `deployments.reconcile-stale` is an explicit command. It requires exact deployment-id
  confirmation plus the `stateVersion` observed by the query.
- Command admission re-reads the aggregate inside the existing `resource-runtime` coordination
  scope. It rejects terminal, recently active, or state-version-changed attempts.
- For `running` and `cancel-requested` attempts the command asks the runtime backend to cancel before
  recording `interrupted`. Earlier planning states do not call runtime cancel.
- Reconciliation records `deployment.interrupted` followed by `deployment.finished`. It preserves
  the original attempt, snapshot, timeline, artifacts, and recovery lineage.
- Retry may create a new attempt from an interrupted attempt when the existing recovery-readiness
  requirements are otherwise satisfied.
- Automatic schedulers may call the same query and command later, but they must not bypass the
  confirmation/state-version/coordination contract. This ADR does not introduce a scheduler.

## Consequences

- A process crash no longer requires direct database edits to release a Resource's deployment
  lifecycle.
- Slow but active work is protected by durable timeline activity and a caller-selected bounded
  threshold; deployments with no durable progress still require explicit reconciliation.
- `interrupted` remains distinct from `failed`, `canceled`, and `superseded` in API, CLI, Web, events,
  persistence, and recovery readiness.
- Read models may aggregate stale candidates for operator dashboards, while mutation remains owned
  by the Deployment aggregate and command handler.

## Rejected Alternatives

- Delete the active row: rejected because attempt history and recovery evidence are immutable.
- Reuse `deployments.cancel`: rejected because cancel expresses live operator intent and does not
  prove lost execution ownership.
- Mark stale attempts failed from a query/projection: rejected because projections do not mutate
  authoritative state.
- Let Cloud own a private stale status or database repair: rejected because deployment lifecycle is
  neutral public Appaloft behavior.
