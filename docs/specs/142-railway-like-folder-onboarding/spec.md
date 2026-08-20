# Railway-Like Folder Onboarding

## Status

Spec confirmed for the first folder-link onboarding slice on `deploy` and `code`.

## Governing Sources

- [Discovery](./discovery.md)
- [ADR-122: Railway-Like Folder Project Onboarding](../../decisions/ADR-122-railway-like-folder-onboarding.md)
- [ADR-118: Remote Code Occupancy](../../decisions/ADR-118-remote-code-occupancy.md)
- [ADR-119: Remote Code Repo-URL Locator](../../decisions/ADR-119-remote-code-repo-url.md)
- [Spec 139](../139-remote-agent-door/spec.md)
- [Test Matrix](../../testing/railway-like-folder-onboarding-test-matrix.md)

## Actor And Outcome

An operator in a folder can deploy or occupy without first creating a Project by
hand and without Git. The folder keeps a durable project link. Switching the
linked project is one command.

## Policy

1. Unlinked folder + no git + non-interactive: create Project named after the
   directory and persist the link.
2. Unlinked folder + exactly one active Project: use it and persist the link.
3. Unlinked folder + several Projects + TTY + no `--yes`: a dedicated
   onboarding command may show one create-versus-select prompt. `--yes` or no
   TTY creates the directory-named Project. A `code` session auto-creates or
   links a Project named after the directory. It never overlays Effect select
   on the Cloud Agents alt-screen.
4. Linked folder: reuse the persisted project id after `projects.show` confirms
   it is still active.
5. Cwd with `origin`: identity is that remote. Find-or-create the matching
   Project (active repository binding, then same name, else create).
6. Cwd without git: identity is `folder.local/cwd/<sanitized-dirname>`. Occupy
   and deploy still succeed.
7. `appaloft project use <projectId>` writes the folder link after `projects.show`.
8. Default `code` from a no-git folder occupies this folder
   (`folder.local/cwd/<name>`) after folder-project onboarding (Spec 139).
   It does not silently resume another repository's occupancy. A cwd with
   origin still occupies that repository instead of the last occupancy.
   Explicit `code <git-remote>` is unchanged (ADR-119).
9. Folder occupancy skips remote fetch, `git init`, clone, and source materialization. Resource source kind is `local-folder`. A leftover partial folder occupancy is repaired on that disk, or replaced without dumping `workspace_open_partial_recovery_required`.
10. Missing login fail-closes immediately with `Run appaloft login`. Status lines
    print on stderr. Failures are non-zero. No fake live URL.

## Acceptance Criteria

| ID | Scenario | Expected result |
| --- | --- | --- |
| `FOLDER-ONBOARD-001` | Unlinked no-git cwd | Creates/links a Project named after the directory. |
| `FOLDER-ONBOARD-002` | Git remote cwd | Binds identity to that remote; find-or-create matching Project. |
| `FOLDER-ONBOARD-003` | Second command in the same cwd | Reuses the persisted folder link; does not create another Project. |
| `FOLDER-ONBOARD-004` | `project use` then later command | Subsequent deploy/code use the switched project id. |
| `FOLDER-ONBOARD-005` | Exactly one existing Project | Uses that Project without prompting. |
| `FOLDER-ONBOARD-006` | Several Projects | Dedicated onboarding TTY (`deploy` / `project use`) may prompt create vs select; `--yes` creates the directory-named Project. A `code` session does not use that select menu: it auto-creates or links by directory name (`FOLDER-ONBOARD-009`). |
| `FOLDER-ONBOARD-007` | No git | Deploy succeeds. Default `code` resumes a live occupancy; with none, occupy this folder. Git is not a gate. Occupy does not clone or materialize a missing remote and does not fail `workspace_open_source_materialization_failed`. |
| `FOLDER-ONBOARD-008` | Status and failure | Short status lines; login miss is immediate; failures non-zero; no fake URL. |
| `FOLDER-ONBOARD-009` | `code` unlinked folder | TTY `code` / `code --pi` auto-creates/links by directory name (`--yes` / Railway `up`). No Effect `Prompt.select` / clack / folder-not-linked selector inside alt-screen, including no-git cwd with several Projects. If a selector still appears, `^c` (SIGINT or stdin `^C`) restores TTY and exits immediately (exit 130 / Cancelled) and must not hang 45s as `Workspace CLI operation failed`. First chrome is Appaloft Cloud Agents + centered preparing the agent. After occupy: Cloud Agents + project name, tree collapsed, coding agent full-screen. `--pi` does not change chrome. |

## Public Surfaces

- `appaloft deploy [path] [--yes] [--project <id>]` creates or reuses the folder
  link, then continues existing deployment admission.
- `appaloft code [path] [--yes]` auto-creates or links a Project named after
  the directory, then occupies that identity. No Effect folder-not-linked
  selector inside the Cloud Agents TUI.
- `appaloft project use <projectId>` is CLI-local folder association. No new
  catalog operation.
- Public docs: `deliver/projects#folder-project-link` and first-deployment CLI.

## Compatibility And Migration

- Existing `--project` still wins and is persisted as the folder link.
- Explicit `code <git-remote>` is unchanged.
- `appaloft context` remains profile selection.
- Folder links are per user home / `APPALOFT_HOME`, not a required cwd file.
- Spec 139 no-git `code` resume (#1319) stays: a no-git folder resumes the
  live occupancy. Spec 142 adds folder occupy only when there is no occupancy
  to resume, and keeps `deploy` / `project use` folder links.
- `#1314` `path|git-remote` stays the workspace-open locator: a non-git
  directory without an explicit remote fail-closes
  `workspace_remote_repository_missing` and does not resume another occupancy.

## Non-Goals

- GitHub Actions auto-deploy
- Production Cloud deploy
- setup-agent
- Marketing site
- Four-step onboarding wizard
- New application catalog operations
