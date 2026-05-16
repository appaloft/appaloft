# Deployment Observation And Recovery Hardening

## Status

- Round: Post-Implementation Sync Round.
- Artifact state: completed coordination spec for `0.12.x` patch hardening.
- Roadmap target: `0.12.x` patch hardening before the `1.0.0-rc` gate.
- Compatibility impact: `pre-1.0-policy`; no new public behavior in the first slice, only
  backward-compatible observation/recovery hardening.
- Release classification: this is not a `1.0.0-rc` release scope. If release-candidate verification
  finds gaps here, release a `0.12.x` patch or return to the owning specs before selecting
  `1.0.0-rc`.

## Business Outcome

Operators can keep observing accepted deployments after disconnects, understand explicit stream
gaps, and choose recovery actions from durable readiness rather than from client stream state.

This round closes the remaining pre-rc deployment observation and recovery hardening blocker by
ordering the work as observation hardening, recovery-command edge-case coverage, an explicit cancel
decision, and rollback candidate/readiness hardening. It does not introduce hidden deployment
mutation behavior.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Deployment observation | Read-only inspection of one deployment attempt through detail, event stream, and logs. | Release orchestration | watch, events, reattach as read-only reconnect |
| Event stream reconnect | Resuming `deployments.stream-events` from a cursor after disconnect. | Deployment observation | reattach, reconnect |
| Stream gap | Explicit envelope that says ordered observation continuity cannot be guaranteed. | Deployment observation | cursor gap, replay gap |
| Recovery readiness | Durable read-side decision for retry, redeploy, rollback, blockers, and candidates. | Deployment recovery | readiness, recovery options |
| Retry | New attempt from a failed/interrupted/canceled/superseded attempt's retained immutable snapshot intent. | Deployment recovery | retry deployment |
| Redeploy | New attempt from the current Resource profile and current effective configuration. | Deployment recovery | deploy current profile again |
| Rollback | New attempt from a retained successful rollback candidate snapshot/artifact. | Deployment recovery | restore previous version |
| Cancel deployment | Future public command, still rebuild-required under ADR-016. | Deployment lifecycle | stop deployment |

## Roadmap Position

Current state:

- `deployments.show`, `deployments.logs`, and `deployments.stream-events` are active observation
  surfaces.
- `deployments.recovery-readiness`, `deployments.retry`, `deployments.redeploy`, and
  `deployments.rollback` are active recovery surfaces under ADR-034.
- `deployments.cancel`, deployment-scoped manual health check, and write-side reattach remain
  rebuild-required under ADR-016.

`0.12.x` patch hardening includes:

- `deployments.stream-events` reconnect, cursor continuation, gap, post-open error, close, heartbeat,
  API/CLI/Web boundary coverage;
- CLI follow and cancellation behavior for `appaloft deployments events`;
- recovery readiness/retry/redeploy/rollback deferred edge-case coverage that does not require new
  command semantics;
- sync of stale docs that still describe active recovery commands as future.

`1.0.0-rc` blocker decisions closed by this round:

- public `deployments.cancel` is not required to close this deployment observation/recovery blocker;
  supersede behavior, stream cancellation, and `operator-work.cancel` cover their existing bounded
  semantics without creating a deployment cancel command;
- remaining recovery edge-case blocker rows are automated for readiness, retry, redeploy, and
  rollback candidate compatibility;
- future MCP/tool descriptors for observation and recovery remain generated-catalog follow-up work,
  not a blocker for this `0.12.x` patch hardening outcome.

Deferred from this hardening slice:

- automatic deployment recovery scheduling;
- stateful data rollback for databases, volumes, queues, dependencies, or secrets;
- a separate paginated rollback-candidate query;
- projection-rebuild-stable cursor redesign beyond the retained event observation store and current
  gap-envelope contract;
- public deployment cancel implementation before its own accepted spec.
- standalone browser-flow coverage for Web reconnect controls beyond existing type/contract
  coverage.

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| DOR-HARDEN-001 | Cursor reconnect continues after known event | A deployment stream returned a valid cursor | Caller resumes with that cursor | Replay starts strictly after the cursor and preserves ordered envelopes. |
| DOR-HARDEN-002 | Cursor gap is explicit | Requested cursor is behind retained history or projection continuity | Caller requests replay/follow | Stream returns a `gap` envelope or startup error with restart guidance; it never silently skips events. |
| DOR-HARDEN-003 | Follow can be canceled safely | CLI/API/Web caller cancels an open follow stream | Abort signal or Ctrl-C fires | Stream source closes, no deployment state mutates, and CLI exits cleanly. |
| DOR-HARDEN-004 | Post-open follow failure stays observation-only | Live follow fails after replay started | Stream emits failure | Caller receives structured `error` or termination; retry/redeploy/rollback readiness is not inferred from the stream failure. |
| DOR-HARDEN-005 | Detail/log boundaries remain separate | Deployment has detail, logs, and event envelopes | Event stream is read | Stream contains structured observation envelopes only, not raw logs or immutable detail payloads. |
| DOR-HARDEN-006 | Recovery readiness ignores client stream gaps | Event stream reports a gap but durable deployment/snapshot/artifact state exists | Operator reads recovery readiness | Readiness computes from durable state, not from the client gap. |
| DOR-HARDEN-007 | Retry/redeploy edge cases are covered | Recovery commands are active | Code Round adds missing deferred tests | Non-retryable attempts, stale markers, invalid current profiles, and coordination conflicts reject safely. |
| DOR-HARDEN-008 | Rollback candidates stay durable and safe | A candidate lacks retained artifact/snapshot or target compatibility | Operator reads readiness or runs rollback | Readiness/command blocks with stable safe reason codes and no stateful data rollback claim. |
| DOR-HARDEN-009 | Cancel remains gated | Operator wants to cancel an active deployment | Current public surface is inspected | No public cancel entrypoint appears until a separate ADR/spec/test matrix accepts semantics. |

## Public Surfaces

| Surface | Outcome |
| --- | --- |
| API/oRPC | Active `deployments.stream-events` bounded/streaming endpoints; active recovery query and retry/redeploy/rollback commands. Harden contract and streaming tests before RC. |
| CLI | Active `appaloft deployments events`, `recovery-readiness`, `retry`, `redeploy`, and `rollback`. Harden follow/cancellation and structured gap/error rendering. |
| Web/UI | Active deployment detail timeline and recovery panel. Harden reconnect behavior and boundary assertions; no cancel button until separate Spec Round. |
| Config | Not applicable; deployment observation/recovery consumes deployment/resource state, not repository config fields. |
| Events | No new public event names in this hardening slice. Existing lifecycle envelopes and recovery trigger metadata remain governed by ADR-029 and ADR-034. |
| Public docs/help | Existing anchors cover recovery (`deploy/recovery`) and streaming SDK behavior (`reference/typescript-sdk`). This slice records a docs outcome without adding new user-facing behavior; cancel docs remain deferred. |
| Future MCP/tool | Deferred-gap unless RC scope explicitly requires generated descriptors for observation/recovery tools. Tools must map to existing operation keys and schemas. |

## Domain Ownership

- Bounded context: Release orchestration.
- Aggregate/resource owner: `Deployment` owns attempt history, immutable snapshots, lifecycle status,
  recovery trigger metadata, logs, and observation envelopes; `Resource` owns the current profile used
  by redeploy.
- Read-model owner: `deployments.stream-events` owns replay/follow observation; `deployments.show`
  owns immutable detail; `deployments.logs` owns raw attempt logs; `deployments.recovery-readiness`
  owns recovery action decisions.
- Runtime owner: runtime target adapters execute accepted attempts but do not decide recovery
  admission, stream continuity, or public cancel semantics.

## Non-Goals

- Do not implement production code in this Spec Round.
- Do not select or prepare a `1.0.0-rc` release from this artifact alone.
- Do not add hidden `deployments.cancel`, write-side `reattach`, manual deployment health check, or
  recovery scheduler behavior.
- Do not weaken stream-gap or recovery-readiness contracts to match missing tests.
- Do not claim stateful rollback.

## Closed Decisions

- Public `deployments.cancel` is deferred. If maintainers later require it before RC, start a
  separate ADR/spec/test-matrix round before adding API/CLI/Web/MCP surfaces.
- `DEP-RECOVERY-READINESS-003`, `DEP-RECOVERY-READINESS-005`, `DEP-RECOVERY-READINESS-008`,
  `DEP-RETRY-002` through `DEP-RETRY-004`, and `DEP-REDEPLOY-002` through `DEP-REDEPLOY-004` are
  now automated blocker coverage.
- Future MCP/tool descriptors are deferred to generated operation-catalog parity.
