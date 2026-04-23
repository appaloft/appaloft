# ADR-029: Deployment Event Stream And Recovery Boundary

## Status

Accepted

## Decision

Deployment observation and recovery split into three explicit public-surface boundaries:

1. `deployments.show` remains the immutable deployment-attempt detail query.
2. `deployments.logs` remains the full deployment-attempt log query.
3. `deployments.stream-events` is the accepted query boundary for replaying and following one
   accepted deployment attempt's structured event stream.

`deployments.stream-events` is a read/query surface. It is the public reconnect boundary for
deployment observation. A future "reattach deployment" capability must not return as a write
command. If a user or transport needs to resume observation after disconnect, it must do so through
`deployments.stream-events` cursor/replay/follow semantics or a transport wrapper over the same
query contract.

Retry, redeploy, and rollback remain outside the public write surface under
[ADR-016](./ADR-016-deployment-command-surface-reset.md). This ADR does not reintroduce those write
commands. Recovery write behavior requires later command/workflow/error/testing specs and must build
on the observation boundaries defined here instead of on the create-time progress transport.

## Context

The current product already distinguishes several deployment read surfaces:

- `deployments.show` for immutable attempt detail;
- `deployments.logs` for full attempt logs;
- create-time deployment progress transport tied to `deployments.create`.

That split is still incomplete for real operator use:

- `deployments.show` should not absorb a live event stream and become an oversized read model;
- `deployments.logs` is too raw and too log-shaped to serve as the deployment event timeline;
- create-time progress transport is useful while the initial command is open, but it is not a
  stable deployment-observation boundary after navigation, disconnect, or later inspection;
- "reattach" has historically been ambiguous between transport reconnect and a business command.

The v1 loop requires users to see what happened to one deployment attempt, continue observing it
after acceptance, and understand which future recovery actions are intentionally absent.

## Options Considered

| Option | Rule | Outcome |
| --- | --- | --- |
| Keep create-time progress transport as the only reconnect path | Reuse technical streaming from `deployments.create` for all later observation. | Rejected because it keeps deployment observation tied to one command transport instead of a durable read boundary. |
| Fold event streaming into `deployments.show` | Let the detail query also own live event follow/reconnect. | Rejected because immutable detail and streaming observation have different transport, cursor, and cancellation semantics. |
| Reintroduce `deployments.reattach` as a command | Model reconnect as a separate deployment write command. | Rejected because reconnect is read/observe behavior, not deployment mutation. |
| Introduce `deployments.stream-events` as the observation query boundary | Keep detail, logs, and event stream as separate read surfaces and leave write recovery commands gated. | Accepted. |

## Chosen Rule

The deployment observation surface is:

```text
deployments.show
  + deployments.stream-events
  + deployments.logs
```

with these responsibilities:

- `deployments.show`: immutable attempt detail and latest structured summary;
- `deployments.stream-events`: ordered event replay, cursor-based reconnect, optional live follow,
  structured stream-gap/error signaling;
- `deployments.logs`: full attempt logs and rawer operator diagnostics.

`deployments.stream-events` may expose canonical deployment lifecycle facts such as:

- `deployment-requested`;
- `build-requested`;
- `deployment-started`;
- `deployment-succeeded`;
- `deployment-failed`;
- normalized progress/timeline envelopes derived from durable state or persisted progress
  projections when clearly labeled as derived observation rather than new facts.

It must not:

- stream raw runtime stdout/stderr as if it were the event timeline;
- expose retry, cancel, redeploy, cleanup, or rollback as hidden write affordances;
- require the caller to keep the original `deployments.create` transport alive;
- turn deployment reconnect into a mutation command.

## Consequences

- Web deployment detail can keep immutable overview data on `deployments.show` while moving
  timeline/reconnect behavior to `deployments.stream-events`.
- CLI and HTTP/oRPC gain one explicit observation surface for "watch this deployment".
- Future recovery commands such as retry/redeploy/rollback must consume the same durable deployment
  history and event observation model rather than inventing parallel transport-only progress rules.
- "Reattach deployment" is no longer a candidate write command. It is satisfied by the stream
  observation query and transport reconnect semantics.
- `deployments.create` progress streaming remains transport-scoped during the initial command, but
  it is no longer the long-term source-of-truth observation boundary.

## Governed Specs

- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Deployment Detail And Observation Workflow Spec](../workflows/deployment-detail-and-observation.md)
- [deployments.show Query Spec](../queries/deployments.show.md)
- [deployments.stream-events Query Spec](../queries/deployments.stream-events.md)
- [Deployment Event Stream Error Spec](../errors/deployments.stream-events.md)
- [Deployment Event Stream Test Matrix](../testing/deployments.stream-events-test-matrix.md)
- [Deployment Event Stream Implementation Plan](../implementation/deployments.stream-events-plan.md)
- [ADR-016: Deployment Command Surface Reset](./ADR-016-deployment-command-surface-reset.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Superseded Open Questions

- Whether deployment reconnect should return as a public `deployments.reattach` command.
- Whether deployment detail should own long-lived follow/reconnect transport behavior directly.

## Current Implementation Notes And Migration Gaps

`deployments.show` is already active in the public catalog and entrypoints. Standalone
`deployments.stream-events` is not implemented yet.

Current Web detail still relies on `deployments.show` for summary and may reconnect to the
create-time progress transport when that transport is still available. That remains a migration seam
until `deployments.stream-events` becomes the formal observation query.

Retry, redeploy, rollback candidate/readiness, and rollback write semantics remain separate future
Spec Rounds under ADR-016.

## Open Questions

- None.
