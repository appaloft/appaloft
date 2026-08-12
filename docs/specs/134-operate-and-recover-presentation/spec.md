# Operate And Recover Presentation

## Status

- Round: Spec
- Artifact state: accepted by the owner-delegated recommended decision on 2026-08-12
- Code changes allowed: yes, after the linked public Ticket is `ready-for-agent`
- Compatibility: additive pre-1.0 public CLI and renderer surface
- Governing decision: ADR-112

## Business Outcome

An operator can use one task-oriented entry to select a Resource, observe its latest Deployment and
runtime evidence, run an explicitly admitted recovery or independent data restore, and verify the
result without a provider console.

## Ubiquitous Language

| Term | Meaning |
| --- | --- |
| Operate target | One selected Resource and its currently relevant Deployment readback. |
| Operate snapshot | Bounded, secret-safe composition of existing read models observed at a stated time. |
| Operate section | One independently available or unavailable evidence group such as health, logs, metrics, proof or backups. |
| Recovery action | Existing retry, redeploy or rollback command admitted by fresh Deployment Recovery Readiness. |
| Data recovery action | Existing backup or restore command; restore defaults to an independent target. |
| Portability handoff | Read-only readiness and exact expert command for the existing instance-scoped portability workflow. |

Operate Session is a presentation term only. It is not an aggregate, persisted lifecycle or public
business operation.

## Acceptance Criteria

| ID | Behavior | Given | When | Then |
| --- | --- | --- | --- | --- |
| OPR-SELECT-001 | Bounded target selection | zero, one or several Resources are visible | `appaloft operate` starts | zero yields an explicit empty result, one is selected, and several are presented in a bounded chooser; an explicit valid id selects exactly that Resource. |
| OPR-SNAPSHOT-002 | Shared truthful snapshot | one Resource is selected | snapshot loads | Resource identity, latest Deployment, health, diagnostics, bounded logs, monitoring rollup, timeline, recovery readiness, proof and available backup evidence come from existing queries with one observation timestamp. |
| OPR-PARTIAL-003 | Partial evidence | one optional query is unavailable | snapshot loads | that section reports unavailable with a safe stable error while other sections remain visible; target lookup and mutation admission never degrade open. |
| OPR-TUI-004 | Native interactive presentation | supported TTY and renderer exist | `appaloft operate` runs | the existing Rust/Ratatui binary enters `operate/v1`, supports target/section/action navigation and restores terminal state on exit/signal. |
| OPR-HEADLESS-005 | Headless parity | no TTY, `--no-tui` or `--json` is selected | command runs | one bounded machine-readable snapshot and action readiness are returned without starting the renderer. |
| OPR-REFRESH-006 | Bounded refresh | a target is selected | user refreshes or bounded polling fires | every section is re-queried, stale data is replaced atomically, and polling stops on renderer exit. |
| OPR-READINESS-007 | Fresh mutation admission | retry/redeploy/rollback is requested | action is previewed | Deployment Recovery Readiness is re-read and a blocked or changed action fails before command dispatch. |
| OPR-CONFIRM-008 | Explicit write confirmation | one admitted write action is selected | first confirmation input occurs | exact action, Resource, Deployment/candidate and consequence are shown; only a second explicit confirmation dispatches. |
| OPR-RETRY-009 | Retry/redeploy recovery | readiness allows retry or redeploy | confirmed action runs | the existing command creates/continues its governed attempt and the presentation refreshes timeline, readiness and proof. |
| OPR-ROLLBACK-010 | Application rollback | a retained successful candidate is ready | confirmed rollback runs | the existing rollback command receives the exact candidate/readiness timestamp and the new attempt is verified; no data restore is implied. |
| OPR-BACKUP-011 | Backup evidence and create | selected Resource has supported StorageVolumes or managed dependencies | backups are inspected or selected volume backup is confirmed | existing plan/list/create operations provide blockers, artifacts and progress; secrets/provider payloads are not rendered. |
| OPR-RESTORE-012 | Independent data restore | a ready StorageVolume backup is selected | restore is previewed and confirmed | existing restore-plan/restore operations create an independent target by default, return readback and do not silently overwrite live data. |
| OPR-PROOF-013 | Before/after verification | a recovery command was accepted | result refresh completes | Deployment proof, health/timeline and backup readback identify verified, failed or incomplete evidence without inferring success from command acceptance. |
| OPR-NOTIFY-014 | Actionable notification evidence | threshold or delivery references exist | snapshot renders | safe warning/critical/delivery state and its owning operation are shown; absence is explicit and creates no notification-center lifecycle. |
| OPR-PORTABILITY-015 | Whole-instance handoff | operator needs exit/migration | portability section opens | existing export-plan/artifact readiness and exact owner-scoped CLI handoff are shown; Resource presentation never executes replace import. |
| OPR-ERROR-016 | Stable safe errors | selection, query, admission, command, renderer or cleanup fails | result renders | stable code/category/phase/retriability and safe remedy survive TUI/JSON without secrets or raw provider output. |
| OPR-CLEANUP-017 | Presentation teardown | exit, signal, disconnect or child failure occurs | session ends | polling, loopback listener and renderer process are bounded and terminal state is restored; no business resource is deleted. |
| OPR-COMPAT-018 | Existing surface compatibility | expert CLI/API/Web/tool users exist | Operate ships | existing operations, inputs, outputs, auth semantics and docs anchors remain unchanged; Operate only orchestrates them. |

## Public Surfaces

- CLI: `appaloft operate [resourceId]`, `--deployment <deploymentId>`, `--no-tui`, `--json`, and
  bounded refresh controls.
- Renderer: additive `operate/v1` mode in `appaloft-workspace-tui`.
- API/oRPC/SDK/MCP: no new business operation or route. Existing operation schemas remain canonical.
- Web: existing Resource/Deployment/Monitor/Recovery/Backup pages remain first-class; no R3 Web
  redesign is required.
- Config/persistence/events: none.
- Public docs: primary anchor `/docs/deliver/recovery/#operate-and-recover`, cross-linked from
  diagnostics and CLI help.

## Error Contract

The presentation may add adapter-level codes `operate_target_not_found`,
`operate_target_selection_required`, `operate_snapshot_unavailable`,
`operate_action_not_ready`, `operate_action_confirmation_required` and
`operate_presentation_failed`. Existing command/query errors pass through the shared safe CLI error
contract. No presentation error authorizes fallback or mutation.

## Workflow

`select -> observe -> preview action -> refresh readiness -> confirm -> dispatch existing command -> observe -> verify`.

- Observe-only use may end after any snapshot.
- A failed optional section remains partial; a missing target or failed fresh readiness blocks write.
- Rollback and data restore are separate actions and evidence chains.
- Renderer exit tears down presentation resources only.

## Non-Goals

- New Resource, Deployment, Backup, Notification or Portability lifecycle/state.
- Fleet monitoring, generic dashboard builder, provider-console mirroring or automatic remediation.
- Live destructive restore, instance replace import, Kubernetes backend work or R4 platform breadth.
- Rebuilding existing Web pages or replacing the Ratatui renderer.

## Compatibility And Migration

This is additive before the first formal release. Existing expert commands remain canonical and
script-compatible. Removing Operate leaves all business state and operation families unchanged.
