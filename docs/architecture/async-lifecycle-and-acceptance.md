# Async Lifecycle And Acceptance

## Normative Contract

Commands that start long-running platform work must define whether success means completion or acceptance. For deployment and server bootstrap workflows, command success means **request accepted**, not downstream completion.

Accepted work must be represented by durable state, formal events, and query/read-model visibility. Post-acceptance failures must be recorded as workflow state and failure events.

## Acceptance

Request acceptance means:

- the command input passed synchronous admission;
- required aggregate/context references were resolved;
- the command has created or selected a durable process/attempt/state record;
- the caller receives a stable id;
- downstream async work may still be pending, retrying, succeeded, failed, or not ready.

Acceptance does not mean:

- runtime execution succeeded;
- edge proxy bootstrap succeeded;
- all event consumers completed;
- read models are already fully updated;
- retries will be attempted without an explicit retry policy.

## Admission Failure Versus Post-Acceptance Failure

| Failure kind | Meaning | Command result | State impact | Event impact |
| --- | --- | --- | --- | --- |
| Admission failure | The request was not accepted. | `err(DomainError)` | Usually no new durable process state. | No success/requested event. |
| Post-acceptance failure | Follow-up work failed after acceptance. | Original command remains `ok(...)`. | Failed or retryable state is persisted. | Failure event is published after state is durable. |
| Event consumer failure | A consumer failed to handle an event. | Original publisher result is not reinterpreted unless publication itself failed before acceptance. | Consumer retry/dead-letter state records the failure. | The original fact event remains true. |
| Worker crash before state persistence | Outcome unknown or retryable. | Accepted command remains accepted. | Attempt state must show retryable/unknown processing state when possible. | No terminal success/failure event until outcome is persisted. |

## Event Publication Semantics

An event says a fact occurred or a request was issued. It does not say every consumer completed.

Examples:

- `deployment-requested` means deployment request accepted, not build or deploy success.
- `build-requested` means build/package work was requested, not built.
- `deployment-started` means rollout started, not succeeded.
- `server-connected` means connectivity requirements passed, not proxy ready.
- `proxy-bootstrap-requested` means proxy bootstrap was requested, not installed.
- `proxy-installed` means proxy ready for that server/attempt, not that every deployment behind it is healthy.

Event specs must define:

- publisher;
- consumer;
- payload;
- state transition;
- ordering;
- idempotency;
- retry owner;
- failure visibility.

## Retry And Attempts

Retry must create a new attempt id.

Do not retry by raw replay of old fact events. Replaying old events is duplicate handling and must be idempotent.

Required retry rules:

- failed deployment retry creates a new deployment attempt id;
- failed proxy bootstrap retry creates a new proxy bootstrap attempt id;
- failed connectivity retry creates a new connectivity attempt id;
- previous failed attempts remain historical and must not be erased by retry;
- retry scheduling must be explicit and tied to `retriable = true`.

## State Types

### Intermediate State

Intermediate state means async work has been accepted but not completed.

Examples:

- deployment accepted/planned/running;
- server connecting;
- proxy bootstrapping;
- worker retry scheduled.

Intermediate state must be queryable or visible through a workflow/read model when users need to understand progress.

### Terminal State

Terminal state means the attempt is complete and no automatic continuation is implied without a new command/job.

Examples:

- deployment succeeded;
- deployment failed;
- proxy installed for the attempt;
- proxy install failed for the attempt.

Terminal failure may be retriable, but retry creates a new attempt.

### Degraded State

Degraded state means the system can operate partially but does not satisfy full readiness.

Examples:

- server connectivity can reach SSH/local shell but not Docker;
- server is connected but proxy bootstrap failed;
- read model is temporarily stale after accepted command.

Degraded state must define which operations remain allowed and which are blocked.

## Aggregate State Versus Read Model State

Aggregate state is the write-side consistency boundary. It protects invariants and records state transitions.

Read-model state is the consumer-facing projection. It may derive readiness or summaries from multiple aggregate/process fields.

Rules:

- commands must not mutate through read models;
- read models may derive status from aggregate/process state;
- if a derived status becomes a business invariant, move the invariant into aggregate/application/process state;
- stale read models must not be used as the sole guard for write-side decisions;
- UI and CLI should display read-model state but command admission must validate on the write side.

## Readiness

Readiness is a contract-specific predicate over durable state and provider policy.

Deployment readiness:

- deployment request accepted;
- required build/package work complete or skipped;
- runtime rollout has started or completed according to the requested query;
- terminal state is explicit.

Server readiness:

- server metadata registered;
- connectivity policy satisfied;
- required credentials usable;
- required proxy policy satisfied;
- failed or degraded phases visible to users and operators.

Readiness must never be inferred only from event publication or log text.

## Shared Workflow Rules

Both deployment creation and server/proxy bootstrap follow the same rules:

- entry workflows collect input, then dispatch commands;
- command success means request accepted;
- async work owns intermediate and terminal states;
- events are formal workflow facts or requests;
- event handling must be idempotent;
- post-acceptance failure is persisted and visible;
- retry creates a new attempt;
- tests assert result, state, event, error, retry, and idempotency semantics.

## Current Implementation Notes And Migration Gaps

`deployments.create` currently awaits runtime backend execution in the use case, while the source-of-truth contract defines acceptance-first behavior.

Deployment terminal events currently flow through `deployment.finished` with status payload and should be split or projected into `deployment-succeeded` and `deployment-failed`.

Server/proxy bootstrap currently starts from `deployment_target.registered`; the source-of-truth workflow introduces `server-connected` and `proxy-bootstrap-requested` as formal lifecycle/orchestration events.

The current event bus is in-memory and fire-and-forget. Durable outbox/inbox, dedupe, retry state, and handler-status read models are not yet established.

Current read models expose parts of deployment and server/proxy state, but some target lifecycle states may need new persisted process state or derived read-model fields.

## Open Questions

- Which workflows require durable outbox/inbox before they are used in production automation?
- Should attempt state be stored inside aggregates, separate process tables, or both?
- Which derived read-model statuses should be promoted into write-side invariants?
- What is the standard retention policy for historical failed attempts?
