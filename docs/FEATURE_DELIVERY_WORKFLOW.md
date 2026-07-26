# Feature Delivery Workflow

All new or changed public product behavior follows:

```text
Grill -> Spec -> Ticket -> Code -> Sync
```

## Grill

Create `docs/specs/<id>-<slug>/discovery.md` and record the actor, observable outcome, existing
evidence, constraints, alternatives, recommended answer, owner decision, rejected options, and open
questions. Do not start Spec or Code until the owner confirms shared understanding.

## Spec

Complete:

- `discovery.md`;
- `spec.md` with requirements, acceptance criteria, non-goals, and compatibility;
- an ADR when ownership, lifecycle, public contract, persistence, or security changes;
- `plan.md` with governing sources, architecture, CQRS/read-model/event impact, tests, and risks;
- `tasks.md` with test-first, implementation, entrypoint/docs, verification, and sync work;
- a Test Matrix mapping every acceptance criterion to a stable test id and evidence layer.

Position the behavior in `BUSINESS_OPERATION_MAP.md` before implementation. Add command/query
contracts and `CORE_OPERATIONS.md` entries only when the accepted Code Round introduces those
operations.

## Ticket

Create GitHub issues only after the Spec is confirmed:

- use one tracking issue for the feature;
- make child issues actor-visible vertical slices, not controller/repository/UI layers;
- link governing ADR/Spec/Test Matrix and include outcome, scope, acceptance criteria, test ids,
  dependencies, non-goals, and cleanup;
- keep file-level implementation tasks in `tasks.md`;
- use `needs-info` when blocked on facts, `ready-for-human` for a required human decision, and
  `ready-for-agent` only when an implementation slice is fully specified.

Public neutral work belongs in `appaloft/appaloft`. Hosted Cloud/Enterprise work belongs in its
private repository and must link the final public merged commit.

## Code

Code Round requires confirmed shared understanding, governing artifacts, and a
`ready-for-agent` issue. Implement the smallest actor-visible slice test-first. Do not expand the
slice into unrelated provider ecosystems or hosted policy.

## Sync

Before merge, reconcile issue state, task checkboxes, ADR, Spec, Test Matrix, operation map, domain
model, roadmap, CLI/API/SDK/Web docs, implementation, verification evidence, migration gaps, and
external-smoke cleanup.

Behavior-neutral docs/index changes and mechanical refactors do not need fake feature artifacts.
A bug whose expected behavior is already governed still needs an issue and regression test.
Emergency incident response may restore service first, then complete decision/spec sync.
