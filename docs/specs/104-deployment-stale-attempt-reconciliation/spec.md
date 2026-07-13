# Deployment Stale Attempt Reconciliation

## Status

- Round: Spec Round complete; Test-First and Code Round authorized.
- Artifact state: ready.
- Roadmap target: post-1.0 additive deployment reliability capability.
- Compatibility impact: additive public query, command, event, and terminal status.

## Business Outcome

Operators can find attempts that stopped producing durable activity and safely terminate their
ownership without SSH, process restart, direct database mutation, or deleting deployment history.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Stale attempt | Non-terminal Deployment whose durable activity has not changed for the selected threshold. | Release orchestration | stuck deployment (display copy only) |
| Durable activity | Latest created, started, or persisted timeline timestamp. | Deployment attempt | last activity |
| State version | Opaque marker binding a stale observation to durable status/activity. | Reconciliation admission | observation marker |
| Reconcile stale attempt | Safely terminate lost execution ownership as interrupted. | Deployment lifecycle | recover stuck deployment |
| Interrupted | Terminal attempt whose execution ownership was lost before a normal terminal result. | Deployment status | none |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| DEP-STALE-001 | List stale attempts | Non-terminal attempts have old and recent durable activity | Query runs with a bounded threshold | Only old attempts are returned with safe evidence and state versions. |
| DEP-STALE-002 | Reconcile planned attempt | A planned attempt is still stale and state version matches | Confirmed command runs | Attempt becomes interrupted without runtime cancel. |
| DEP-STALE-003 | Reconcile running attempt | A running attempt is still stale and state version matches | Confirmed command runs | Backend cancel succeeds, attempt becomes interrupted, history remains queryable. |
| DEP-STALE-004 | Activity changed | Timeline/status changes after query | Command runs with old state version | Command rejects and does not mutate or cancel runtime. |
| DEP-STALE-005 | Threshold no longer met | Attempt has recent durable activity | Command runs | Command rejects and preserves active state. |
| DEP-STALE-006 | Terminal attempt | Attempt already completed | Query or command runs | Query omits it; command rejects without mutation. |
| DEP-STALE-007 | Retry interrupted attempt | Interrupted attempt retains valid snapshot inputs | Recovery readiness and retry run | Retry is allowed and creates a new attempt id. |
| DEP-STALE-008 | Tenant isolation | Attempt belongs to another tenant | Query or command runs | Repository context fails closed. |

## Domain Ownership

- Bounded context: Release orchestration.
- Aggregate owner: `Deployment` owns interrupted transition and events.
- Query owner: stale-attempt read policy composes bounded Deployment read-model data.
- Runtime owner: `ExecutionBackend` performs best-effort target cancellation only after command
  admission.

## Public Surfaces

- API: bounded list query and confirmed reconcile command.
- CLI: `appaloft deployments stale` and `appaloft deployments reconcile-stale`.
- Web/UI: deployment reliability surfaces consume the same query and command; no Web-only policy.
- Events: `deployment.interrupted`, then existing `deployment.finished`.
- SDK/OpenAPI/MCP: generated from the operation catalog.
- Public docs/help: deployment recovery page.

## Non-Goals

- No automatic scheduler in this slice.
- No database, volume, dependency, or route rollback.
- No resumption inside the old attempt.
- No inference from process lists, UI stream connectivity, or unpersisted logs.
- No Cloud pricing, entitlement, runner-fleet, or SLA behavior.

## Open Questions

- None blocking Code Round.
