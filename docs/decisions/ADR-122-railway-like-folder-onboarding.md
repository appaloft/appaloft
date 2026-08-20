# ADR-122: Railway-Like Folder Project Onboarding

Status: Accepted

Date: 2026-08-20

## Context

Railway 5.41.2 folder `up` does not require Git. With no linked project,
`railway up -y` implies `--new`, names the project after the directory, and
creates project + service. The folder link may live in the user association
rather than a `.railway` file in cwd. `railway link` selects an existing
project. Switching project/service/environment is first-class context, not a
four-step wizard. GitHub auto-deploy is a separate path.

Appaloft today can treat git as occupancy identity. Default `appaloft code`
from a non-git directory may resume an unrelated occupancy (for example
traefik/whoami). Folder `deploy` already uses cwd, but does not persist a
folder-to-project link, so the next command in the same folder can invent a
different project.

Owner Grill 2026-08-20 asked for the smallest Railway-like onboarding slice
on `deploy` and `code` for local `appaloftdev` verification. No GitHub
release, production Cloud deploy, setup-agent, marketing site, or four-step
wizard.

Issue #1314 (path|git-remote, non-git occupies this folder) may still be
open. This decision is additive: git remote remains correspondence when
present; missing git is not a gate.

## Decision

1. First `appaloft deploy` / `appaloft code` in an unlinked folder resolves a
   Project for this cwd and persists a user-scoped folder link
   (`$APPALOFT_HOME/folder-links.json`, default `~/.appaloft/folder-links.json`).
   The next command in the same cwd reuses that link.
2. Unlinked, no-git, non-interactive (`-y` / no TTY) creates a Project named
   after the directory. Exactly one active Project is used. Several Projects
   on a dedicated onboarding TTY (`deploy` when it prompts, or `project use`)
   may create-versus-select once. `--yes` creates the directory-named Project.
   A `code` session never prompts: it auto-creates or links a Project named
   after the directory (Railway `up` / `--yes` style) so Effect select cannot
   punch out of the occupancy alt-screen.
3. `appaloft project use <projectId>` switches the linked Project for this
   folder. `appaloft context` remains control-plane profile selection.
4. Git is correspondence, not a gate. A cwd with `origin` uses that remote as
   occupancy / find-or-create identity. A cwd without git still succeeds with
   a folder occupancy identity `folder.local/cwd/<sanitized-dirname>`.
5. Default `code` from a no-git folder occupies this folder's `folder.local`
   identity after onboarding (Spec 139). It does not silently resume another
   repository's occupancy. A cwd with `origin` occupies that repository,
   not the last occupancy. Explicit `code <git-remote>` still follows ADR-119.
6. Folder occupancy skips `git init`, `git fetch`, checkout, clone, and
   source materialization. Community activation binds Resource source as
   `local-folder`, not a fake remote-git URL. A leftover partial folder
   occupancy is repaired on that disk, or replaced without dumping
   `workspace_open_partial_recovery_required` or requiring the user to
   terminate.
7. Login stays fail-fast with `Run appaloft login`. No 40s blank cursor. No
   invented live URL. Status lines print on stderr.
8. No new catalog operation. Folder link is CLI presentation over existing
   `projects.create` / `projects.list` / `projects.show`.

## Consequences

- Spec 139 WS-REMOTE-RESUME-004 / WS-REMOTE-NO-UPLOAD-006 occupy this folder
  after Spec 142 onboarding. Default `code` does not silently resume another
  repository's occupancy. Spec 142 also covers `deploy` / `project use`.
- Help, skill `cli-entrypoints.md`, and public project docs name
  `appaloft project use` and folder create-or-link.
- Expected public SemVer: minor presentation change. No catalog field.

## Rejected Alternatives

- Four-step onboarding wizard.
- Requiring git to occupy or deploy.
- Treating `appaloft context use` as folder project switch.
- Writing a required `.appaloft` file into cwd (Railway often has no
  `.railway` after `up`).
- GitHub Actions auto-deploy as part of this slice.
