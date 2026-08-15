# Tasks: Instant Local Scratch

## Governance

- [x] Complete independent Grill beyond Railway/Paseo and accept the four owner decisions.
- [x] Accept ADR-116, revise ADR-107 presentation target, scope ADR-103 Git fail-closed.
- [x] Write Spec 138, plan, Test Matrix and Cloud composition artifact.
- [x] Open public tracking [#1123](https://github.com/appaloft/appaloft/issues/1123) and first actor-visible Ticket [#1124](https://github.com/appaloft/appaloft/issues/1124) `ready-for-agent`. Cloud tracking deferred until upgrade composition needs a private change.

## Test-First

- [x] `WS-SCRATCH-CLI-001`: `code` does not construct `OpenAgentWorkspaceCommand` without `--profile`/`--new`.
- [x] `WS-SCRATCH-EMPTY-002` / `WS-SCRATCH-DIRTY-003` / `WS-SCRATCH-LOGGED-OUT-004`: empty, dirty, logged-out dirs resolve scratch.
- [x] `WS-SCRATCH-BANNER-005` / `WS-SCRATCH-NO-ATTACH-009`: banner + `--no-attach` without Git preflight.
- [x] `WS-SCRATCH-HARNESS-006` / `WS-SCRATCH-INSTALL-007`: OpenCode else Pi else refuse-install error.
- [x] `WS-SCRATCH-NO-STATE-012`: no Binding/Profile/Sandbox/Server dispatch.
- [x] `WS-SCRATCH-COMPAT-013`: `workspace open` still fail-closes on dirty/non-git.
- [x] `WS-SCRATCH-DOCS-017` / `WS-SCRATCH-PACKAGE-018`: help and docs-registry rows.

## Source Of Truth

- [x] Public operation map, `workspaces.open` entrypoints, Agent Workspace workflow.
- [x] Cloud program / product-path / roadmap: R1.1 historical; R7 revises default entry.
- [x] Localized `agent-workspace-open` help and skill `cli-entrypoints.md` in Code Round.

## Implementation

- [x] Split `code` from `workspace open` in the CLI adapter.
- [x] Add scratch coordinator, harness probe, banner, skill offer, install prompt.
- [x] Keep `--profile`/`--new` on durable-open Git fail-closed.
- [x] Do not add Cloud wrappers or catalog operations.

## Verification

- [x] Focused CLI tests bound to `WS-SCRATCH-*`.
- [x] `appaloftdev code --help`
- [x] `appaloftdev code <empty-dir> --no-attach`
- [x] `appaloftdev code <dirty-dir> --no-attach`
- [x] Public lint/typecheck/affected tests; docs-impact gate.

## Post-Implementation Sync

- [ ] Reconcile Spec/plan/tasks/matrix/docs/code and close the first Ticket.
