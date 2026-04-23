# Deployment Event Stream Test Matrix

## Normative Contract

Tests for `deployments.stream-events` must verify that deployment event replay and follow behavior
is a first-class read surface separate from deployment detail and deployment logs.

The query must support reconnect and continuation after command acceptance without turning
observation into a write command.

## Global References

This test matrix inherits:

- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-029: Deployment Event Stream And Recovery Boundary](../decisions/ADR-029-deployment-event-stream-and-recovery-boundary.md)
- [deployments.stream-events Query Spec](../queries/deployments.stream-events.md)
- [Deployment Event Stream Error Spec](../errors/deployments.stream-events.md)
- [Deployment Event Stream Implementation Plan](../implementation/deployments.stream-events-plan.md)
- [Deployment Detail And Observation Workflow Spec](../workflows/deployment-detail-and-observation.md)
- [deployments.show Query Spec](../queries/deployments.show.md)
- [deployments.logs Query/operation boundary](../CORE_OPERATIONS.md)
- [Spec-Driven Testing](./SPEC_DRIVEN_TESTING.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Test Layers

| Layer | Focus |
| --- | --- |
| Query schema | Input validation, history bounds, cursor semantics, follow flags. |
| Query handler/service | Deployment resolution, ordered replay, cursor continuation, and delegation to event observation source. |
| Event observation source fake | Replay, follow, heartbeat, gap, error, and close behavior. |
| Read-model/event projection | Canonical event ordering, normalized progress envelopes, terminal close behavior. |
| HTTP/oRPC | Bounded replay and streaming serialization over the same query schema. |
| CLI | Historical replay, watch/follow mode, Ctrl-C cancellation, structured errors. |
| Web deployment detail | Timeline tab or panel loads replay, reconnects with cursor, and keeps logs/detail separate. |

## Given / When / Then Template

```md
Given:
- Deployment:
- Durable event/progress state:
- Cursor/history settings:
- Entrypoint:

When:
- The caller requests deployment event replay or follow mode.

Then:
- Query input:
- Replay/follow source calls:
- Event envelopes:
- Gap/error behavior:
- Cancellation behavior:
- Expected absence of write affordances:
```

## Query And Service Matrix

| Test ID | Preferred automation | Case | Input/read state | Expected query behavior | Expected result |
| --- | --- | --- | --- | --- | --- |
| DEP-EVENTS-QRY-001 | integration | Bounded historical replay | Deployment exists with ordered domain/progress events | Resolve deployment and replay bounded history | Ordered `event` envelopes only up to requested/default limit |
| DEP-EVENTS-QRY-002 | integration | Missing deployment | Unknown deployment id | Reject during deployment resolution | `err(not_found)`; observation source not called |
| DEP-EVENTS-QRY-003 | integration | Invalid cursor | Cursor is malformed or cannot be matched safely | Reject during cursor resolution | `err(deployment_event_cursor_invalid)` |
| DEP-EVENTS-QRY-004 | integration | Replay after cursor | Deployment exists and cursor matches a known envelope | Start strictly after cursor | First replayed event is newer than the supplied cursor |
| DEP-EVENTS-QRY-005 | integration | No durable event source | Deployment exists but event/progress source is unavailable | Reject during source load | `err(deployment_event_stream_unavailable)` |
| DEP-EVENTS-QRY-006 | integration | Replay with normalized progress | Deployment has canonical events plus persisted progress projection | Query emits labeled `source = progress-projection` envelopes without inventing new facts | Replay contains both fact and progress envelopes with distinct labels |
| DEP-EVENTS-QRY-007 | integration | Historical-only query | `follow = false` | Replay then close | Finite replay with `closed(completed|source-ended)` or transport EOF |
| DEP-EVENTS-QRY-008 | integration | Detail/log separation | Deployment has detail, logs, and event replay available | Query returns only timeline/event envelopes | No immutable detail sections or raw log lines appear in the stream |

## Streaming Matrix

| Test ID | Preferred automation | Case | Stream source behavior | Expected stream result | Expected cleanup |
| --- | --- | --- | --- | --- | --- |
| DEP-EVENTS-STREAM-001 | integration | Replay plus follow | Source replays history, then emits new lifecycle event | Ordered replay continues into live follow | Stream remains open until close policy triggers |
| DEP-EVENTS-STREAM-002 | integration | Heartbeat | No new events during follow interval | `heartbeat` envelopes may be emitted | Stream remains open |
| DEP-EVENTS-STREAM-003 | integration | Terminal deployment closes | Deployment reaches terminal state and backlog is drained | `closed(completed)` when `untilTerminal = true` | Source closed cleanly |
| DEP-EVENTS-STREAM-004 | integration | Caller cancels | Abort signal fires or transport disconnects | `closed(cancelled)` when possible | No orphan follow source |
| DEP-EVENTS-STREAM-005 | integration | Cursor gap during replay | Requested cursor points into pruned/rebuilt projection window | `gap` envelope with restart guidance, or whole-query error before replay when stream cannot start safely | Source closed or not opened further |
| DEP-EVENTS-STREAM-006 | integration | Follow source fails after open | Replay succeeded, but live follow source later fails | Structured `error` envelope or transport termination after error serialization | Source closed |

## Ownership And Boundary Matrix

| Test ID | Preferred automation | Case | Required assertion |
| --- | --- | --- | --- |
| DEP-EVENTS-OWN-001 | integration | No hidden write actions | Stream envelopes do not expose retry, cancel, redeploy, cleanup, or rollback as active operations. |
| DEP-EVENTS-OWN-002 | integration | Reattach stays read-only | Reconnect uses cursor/follow semantics on the same query, not a command dispatch. |
| DEP-EVENTS-OWN-003 | integration | Logs remain separate | Raw attempt log lines remain `deployments.logs`; event stream contains structured envelopes only. |
| DEP-EVENTS-OWN-004 | integration | Detail remains separate | Immutable attempt snapshot remains `deployments.show`; event stream does not replace deployment detail. |

## Entrypoint Matrix

| Test ID | Preferred automation | Entrypoint | Case | Expected behavior |
| --- | --- | --- | --- | --- |
| DEP-EVENTS-ENTRY-001 | e2e-preferred | Web deployment detail | User opens a deployment timeline/watch panel | Page loads replay from `deployments.stream-events` and keeps logs/detail on their own queries. |
| DEP-EVENTS-ENTRY-002 | e2e-preferred | Web reconnect | User refreshes or reconnects after receiving a cursor | Page resumes observation from the supplied cursor instead of restarting hidden `deployments.create` transport state. |
| DEP-EVENTS-ENTRY-003 | e2e-preferred | CLI | `appaloft deployments events <deploymentId> --follow --json` | Prints normalized envelopes and exits cleanly on Ctrl-C. |
| DEP-EVENTS-ENTRY-004 | e2e-preferred | API/oRPC | Streaming endpoint | Reuses the shared query schema and serializes normalized stream envelopes. |
| DEP-EVENTS-ENTRY-005 | e2e-preferred | Quick Deploy completion | User follows a just-accepted deployment after initial create response | Completion flow may hand off to `deployments.stream-events` instead of depending on the original create-time transport forever. |

## Current Implementation Notes And Migration Gaps

Automated coverage now exists for:

- `DEP-EVENTS-QRY-001` in `packages/application/test/stream-deployment-events.test.ts`;
- `DEP-EVENTS-QRY-002` in `packages/application/test/stream-deployment-events.test.ts`;
- `DEP-EVENTS-QRY-003` in `apps/shell/test/deployment-event-observer.test.ts`;
- `DEP-EVENTS-QRY-006` in `apps/shell/test/deployment-event-observer.test.ts`;
- `DEP-EVENTS-STREAM-001` service-mode coverage in
  `packages/application/test/stream-deployment-events.test.ts`;
- envelope merge, cursor extraction, heartbeat/gap/error rendering, and summary mapping in
  `apps/web/src/lib/console/deployment-progress.test.ts`;
- `DEP-EVENTS-ENTRY-004` bounded HTTP/oRPC dispatch in
  `packages/orpc/test/deployment-event-stream.http.test.ts`;
- `DEP-EVENTS-ENTRY-005` Web deployment detail replay/follow behavior in
  `apps/web/test/e2e-webview/home.webview.test.ts`.

Remaining executable coverage gaps:

- `DEP-EVENTS-QRY-004` cursor continuation after a known envelope;
- `DEP-EVENTS-QRY-005` source-unavailable startup error;
- `DEP-EVENTS-QRY-007` finite historical-only close behavior at the query-service boundary;
- `DEP-EVENTS-QRY-008` detail/log separation at the query-service boundary;
- `DEP-EVENTS-STREAM-002` heartbeat behavior;
- `DEP-EVENTS-STREAM-003` terminal close behavior beyond service-mode smoke coverage;
- `DEP-EVENTS-STREAM-004` caller cancellation and cleanup;
- `DEP-EVENTS-STREAM-005` explicit gap-envelope scenario;
- `DEP-EVENTS-STREAM-006` post-open follow-source failure;
- `DEP-EVENTS-OWN-001` through `DEP-EVENTS-OWN-004` as explicit boundary assertions;
- `DEP-EVENTS-ENTRY-001` and `DEP-EVENTS-ENTRY-002` as standalone Web timeline/reconnect rows
  separate from the Quick Deploy handoff row;
- `DEP-EVENTS-ENTRY-003` CLI follow/cancellation coverage.

## Open Questions

- None for the active first implementation. Cursor reconnect remains a named executable coverage gap.
