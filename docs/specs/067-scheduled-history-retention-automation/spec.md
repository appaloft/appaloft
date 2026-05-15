# Scheduled History Retention Automation

## Status

- Round: Code Round
- Artifact state: implemented-first-slice

## Business Outcome

Operators can configure safe retention defaults once and let Appaloft periodically run governed
history retention checks without bypassing manual prune command safety, legal holds, immutable
archives, replay guards, active process attempt rules, or operator-work visibility.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Scheduled history retention | Internal worker workflow that computes category cutoffs from retention defaults and runs governed category retention through existing prune commands or direct retention stores. | Operator/Internal State | scheduled audit/event retention |
| Retention default policy | Non-executing category policy that supplies retention days and scheduling flags. | Retention policy | organization defaults |
| Retention category dispatch | A scheduled worker handoff to the existing command or direct retention store for one governed history category. | Worker execution | category prune |
| Retention guard | Category-specific rule that skips protected rows even when retention policy allows destructive scheduling. | Retention safety | legal hold, archive guard, replay guard |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| SCHED-HISTORY-RETENTION-001 | Dry-run default dispatch | an enabled retention default has dry-run scheduling enabled and destructive scheduling disabled | the scheduled retention worker ticks | Appaloft records durable process work and runs the category retention boundary with computed `before` and `dryRun = true`. |
| SCHED-HISTORY-RETENTION-002 | Destructive scheduling is policy-gated | an enabled retention default explicitly enables destructive scheduling | the scheduled retention worker ticks | Appaloft dispatches the category prune command with `dryRun = false`; categories without destructive permission remain dry-run or skipped. |
| SCHED-HISTORY-RETENTION-003 | Category guards stay authoritative | destructive scheduling is enabled and retained rows are guarded | the category prune command runs | guarded rows are skipped by the category command/store and safe skipped counts are recorded. |
| SCHED-HISTORY-RETENTION-004 | Durable process visibility | scheduled retention work is accepted | command execution succeeds or fails | operator work shows pending/running/succeeded/failed/retry-scheduled/dead-lettered/canceled/recovered state with safe details and no secret-bearing payloads. |
| SCHED-HISTORY-RETENTION-005 | Unsupported category is visible | a retention default category has no scheduled dispatcher in the current implementation | the worker ticks | Appaloft skips it with a safe unsupported-category reason and does not call repositories or stores directly. |
| SCHED-HISTORY-RETENTION-006 | Entrypoints remain existing surfaces | operators configure or inspect scheduled retention | CLI, HTTP/oRPC, Web, SDK, or future MCP is used | public behavior uses `retention-defaults.*`, manual prune commands, and `operator-work.*`; no parallel public scheduled-prune command is required. |

## Domain Ownership

- Bounded context: Operator/Internal State and retention policy.
- Aggregate/resource owner: scheduled history retention owns worker orchestration only; each
  retained history category owns its own prune command or direct retention store and guard rules.
- Upstream/downstream contexts: audit history, domain event stream retention, provider job logs,
  deployment logs, runtime log archives, runtime monitoring samples, and durable process attempts
  expose command or direct retention-store boundaries for scheduled dispatch.

## Public Surfaces

- API: no new public scheduled retention endpoint in the first slice.
- CLI: no new public scheduled retention command in the first slice.
- Web/UI: no maintenance write controls in this worker slice; configured worker status is visible
  through governed diagnostics/status surfaces.
- Config: disabled-by-default self-hosted scheduler enablement lives in shell/runtime config.
- Events: no event-sourcing or public event schema change in the first slice.
- Public docs/help: link existing retention-defaults, manual prune, and operator-work anchors.
  Runtime scheduler env vars are documented at
  `reference/configuration#reference-scheduled-workers`.

## Non-Goals

- Replacing existing manual prune commands.
- Adding a global message broker or event sourcing subsystem.
- Bypassing category-specific retention stores, legal holds, immutable archives, replay guards, or
  active process attempt rules.
- Scheduling runtime target artifact/workspace prune; that remains ADR-055.
- Creating Web maintenance write controls in this slice. Read-only worker activation status is
  handled by the governed system diagnostics surface.

## Current Implementation Notes And Governed Follow-Ups

- Manual prune commands exist for audit rows, audit archives, provider job logs, deployment logs,
  resource runtime log archives, domain event stream rows, and operator-work process attempts.
- Runtime monitoring samples are governed by the same scheduled history retention runner through
  the PG/PGlite sample retention store rather than a public manual prune command.
- Organization retention defaults are active and can be consumed by the disabled-by-default
  scheduled history retention runner. The runner has an explicit batch-size setting so one tick
  cannot scan every enabled retention default when operators intentionally enable it.
- Scheduled history retention automation has an application service and shell runner wiring. It
  adds no public scheduled-prune command, HTTP/oRPC route, or Web maintenance surface in this
  slice.
- ADR-054 durable process delivery is the current outbox/inbox-equivalent baseline, so retention for
  accepted background work is represented by `operator-work.prune` over durable process attempts.
  A separate outbox/inbox retention command is not applicable unless a future ADR introduces a
  separate outbox/inbox store.
