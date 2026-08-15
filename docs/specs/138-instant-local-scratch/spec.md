# Instant Local Scratch

## Status

- Round: Code
- Artifact state: accepted from owner-confirmed Grill on 2026-08-15; first slice implemented
- Tracking: public [#1123](https://github.com/appaloft/appaloft/issues/1123)
- First slice: public [#1124](https://github.com/appaloft/appaloft/issues/1124)
- Docs Round outcome: existing `#agent-workspace-open` plus `agent.scratch` registry topic
- Code changes allowed: after Ticket #1124
- Compatibility: public minor; default `appaloft code` behavior changes, `workspace open` unchanged
- Governing decision: ADR-116; ADR-107 presentation target revised; ADR-103 Git fail-closed scoped
  to durable open

## Business Outcome

A developer in any local directory can run `appaloft code` and enter OpenCode or Pi on this Mac in
under two seconds, without Git, login, Binding, Profile or Cloud. The session banner states that
the work is local scratch and not saved remotely. Durable Workspace remains an explicit upgrade.

## Ubiquitous Language

| Term | Meaning | Compatibility |
| --- | --- | --- |
| Scratch session | Local, non-durable agent session on this Mac. No Sandbox identity. | New default `appaloft code` meaning. |
| Linked session | Same agent process after explicit login, enroll, bind or remote-open. | Upgrade, not a new aggregate. |
| Durable Workspace | Existing Sandbox-backed `workspaces.open` workflow. `workspaceId = sandboxId`. | Unchanged. |
| Implicit this-Mac | Scratch default target. Not an enrolled Server. | Distinct from `local-trusted`. |
| `local-trusted` | Explicit same-machine Server from `server enroll --local`. | Unchanged Spec 129. |
| `appaloft-local` | Invisible default harness/isolation rule for scratch. Not a persisted Profile. | Docs/code name only. |
| `appaloft-remote` | Invisible minimum template for registered Server / Cloud managed upgrade. | Materialized only on request. |

## Requirements And Acceptance Criteria

| ID | Behavior | Given | When | Then |
| --- | --- | --- | --- | --- |
| WS-SCRATCH-CLI-001 | Default `code` is scratch | cwd is any directory | `appaloft code` or `appaloft code [path]` runs | CLI does not call `workspaces.open` or Git fail-closed; path defaults to `.`. |
| WS-SCRATCH-EMPTY-002 | Empty non-git directory | directory has no `.git` | `appaloft code` runs | Scratch starts; no Binding/Profile/Cloud/Sandbox write. |
| WS-SCRATCH-DIRTY-003 | Dirty or detached tree | worktree is dirty, detached, unpushed or mismatched | `appaloft code` runs | Scratch starts; dirty files stay local and are not uploaded. |
| WS-SCRATCH-LOGGED-OUT-004 | Logged-out directory | no Appaloft login, token or Cloud profile | `appaloft code` runs | Scratch starts; no login prompt is the door. |
| WS-SCRATCH-BANNER-005 | Scratch banner | scratch resolves | attach or `--no-attach` completes resolution | stdout includes `Local scratch · this Mac · not saved remotely`. |
| WS-SCRATCH-HARNESS-006 | Default harness | OpenCode and/or Pi may be present | scratch resolves a binary | OpenCode if present, else Pi, else install prompt. Claude/Codex are not automatic. |
| WS-SCRATCH-INSTALL-007 | Only hard pre-attach failure | no supported binary | user refuses install | process exits non-zero with a stable install-refused error; no control-plane mutation. |
| WS-SCRATCH-ATTACH-008 | Native attach | a supported binary exists and attach is on | scratch starts | native OpenCode/Pi TUI is spawned in the selected directory; no Sandbox PTY is required. |
| WS-SCRATCH-NO-ATTACH-009 | Headless resolution | `--no-attach` is supplied | scratch runs | resolution, banner and harness choice print; no `workspaces.open`; exit 0 if a binary exists or after a non-refused install skip is not requested. |
| WS-SCRATCH-SKILL-010 | Skill injection | scratch starts | harness launch is prepared | public Appaloft skill is offered to the harness; vendor TUI text is not parsed. |
| WS-SCRATCH-MUTATION-011 | Catalog-only writes | user or agent asks login/enroll/deploy/delete | a write is proposed | only existing public operations run, with scoped human approval. |
| WS-SCRATCH-NO-STATE-012 | No control-plane residue | scratch starts and exits | control plane / local Appaloft DB is inspected | no new Sandbox, Binding, Project, Profile installation, Server or Cloud row. |
| WS-SCRATCH-COMPAT-013 | Durable open unchanged | caller uses `workspace open` or `workspace create` | Git is dirty/detached/unpushed/non-git | existing ADR-103 fail-closed errors still return before mutation. |
| WS-SCRATCH-UPGRADE-014 | Logged-in entitled default | Cloud login and entitlement exist | default `appaloft code` runs | result is still scratch; managed is not auto-selected. |
| WS-SCRATCH-MANAGED-015 | Managed stays explicit | user asks to open a remote/managed Workspace | upgrade path runs | existing `workspaces.open` / R1.1 evidence apply; no-capacity fail-closes; no silent this-Mac fallback. |
| WS-SCRATCH-PROFILE-016 | Invisible defaults | first scratch run | no `--profile` | no Profile installation is persisted; `--profile` remains advanced durable-open / later-slice. |
| WS-SCRATCH-DOCS-017 | Help names both doors | developer reads `code --help` or Workspace docs | help is rendered | scratch is the default `code` path; `workspace open` is the durable Git-safe path. |
| WS-SCRATCH-PACKAGE-018 | Source CLI / package help | `appaloftdev code --help` or packaged `appaloft code --help` | help starts | help works without persistence/runtime composition. |

## First Slice Scope

Slice 1 closes `WS-SCRATCH-CLI-001` through `WS-SCRATCH-NO-STATE-012`, plus `WS-SCRATCH-COMPAT-013`,
`WS-SCRATCH-DOCS-017` and `WS-SCRATCH-PACKAGE-018` for empty, dirty and logged-out directories.

`WS-SCRATCH-UPGRADE-014` and `WS-SCRATCH-MANAGED-015` are specified now so default `code` cannot
silently keep R1.1 auto-managed behavior. Full scratch → login → enroll → clean push → same-agent
durable reconnect is a later ticket.

## Public Surfaces

- CLI: default `appaloft code [path] [--no-attach]` becomes scratch. `--profile` / `--new` remain
  durable-open flags and must not silently create scratch state; if supplied on default `code` in
  slice 1 they either fail closed with guidance to `workspace open` or dispatch durable open only
  after the existing Git preflight. Recommended slice-1 behavior: `--profile` / `--new` keep
  durable-open meaning and therefore keep Git fail-closed.
- API/oRPC/SDK/MCP: no new operation. `workspaces.open` remains the durable command.
- Web/Console: no new first-slice behavior.
- Config/persistence: no product table, event or Cloud row. Native harness session files may appear
  under user home / cwd per vendor rules.
- Public docs/help: `agent-workspace-open` plus skill `cli-entrypoints.md`.
- Future tool/MCP: skill/MCP injection only; do not add `code` as an operation name.

## Domain Ownership

- Bounded context: CLI adapter + local scratch coordination, beside existing Workspace workflow.
- Scratch owner: public CLI. No aggregate root.
- Durable Workspace owner: Sandbox via `workspaces.open`.
- Explicit local Server owner: existing Server enrollment.
- Cloud owner: entitlement / managed template / placement on the upgrade path only.

## Error Contract

| Code | Category | Phase | Retriable |
| --- | --- | --- | --- |
| `workspace_scratch_agent_missing` | validation | `scratch-harness` | yes, after install |
| `workspace_scratch_install_refused` | validation | `scratch-harness` | no |
| `workspace_scratch_path_invalid` | validation | `scratch-path` | no |
| `workspace_scratch_agent_invalid` | validation | `scratch-harness` | no |
| `workspace_scratch_agent_failed` | conflict | `scratch-harness` | yes, after the local Agent is healthy |

Scratch errors must not mention Sandbox ids, Server hosts, credentials or capacity probes.

## Non-Goals

- Entry wizard for Binding / Profile / Server.
- Silent dirty-tree upload or implicit git sync.
- Silent managed → BYOS/local fallback.
- Cloud-only Workspace lifecycle.
- Auto-approve deploy / enroll / delete / other writes.
- New Chat UI or vendor conversation parser.
- Third default harness, mobile, R2 Worker changes, R6 replay.
- Deleting `workspace open` Git fail-closed rules.
- Reopening R1–R6 gates or inventing Host/Machine.

## Compatibility And Migration

- Spec 125 remains the historical `code` == `workspaces.open` delivery record.
- ADR-116 supersedes ADR-107 decision 1–3 for default `code` only.
- Users who depended on R1.1 auto-managed `appaloft code` migrate to `appaloft workspace open`.
- Expected public SemVer impact: minor, with explicit help/changelog text.

## Open Questions

None that change first-slice ownership, command shape, lifecycle or persistence.
