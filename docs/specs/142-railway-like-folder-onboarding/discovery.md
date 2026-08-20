# Railway-Like Folder Onboarding — Grill / Discovery

## Status

- Round: Grill complete.
- Date: 2026-08-20.
- Owner decisions: accepted from the 2026-08-20 Railway-like onboarding request.
- Code changes allowed: after Spec artifacts exist. Tracking issue may follow
  the merge-quality PR when GitHub write is available.

## Actor And Observable Outcome

An operator runs `appaloft deploy` or `appaloft code` in a folder. If the folder
is not linked, Appaloft creates or selects a Project (directory name / the only
existing Project / a one-step TTY choice) and persists the link. The next
command in that folder reuses the link. `project use` switches it. Git remote is
used when present and is not required.

## Evidence And Facts

- Railway 5.41.2: `railway up -y` with no linked project implies `--new`,
  project name = directory name, creates project + service, Git is not required.
- After success, cwd may have no `.railway`; link lives in Railway's
  user/project association. `railway link` selects an existing project.
- GitHub auto-deploy is a separate Railway path from folder `up`.
- Appaloft `appaloft project` has create/list/show/rename, not `use`/`link`.
- `appaloft context` is control-plane profile, not folder project link.
- Default `code` without origin occupies this folder after create-or-link
  (WS-REMOTE-NO-UPLOAD-006 / WS-REMOTE-RESUME-004). It must not silently
  resume another repository's occupancy.
- Login already fail-closes with `Run appaloft login`.
- #1314 (path|git-remote, non-git occupies this folder) may still be open.

## Recommended Decisions

1. Persist a user-scoped folder-to-project link. Reuse it on the next command.
2. Unlinked no-git default: create a Project named after the directory; use the
   only Project when exactly one exists; TTY prompt when several; `--yes` creates.
3. Git remote is occupancy/project correspondence when present.
4. `project use` switches the folder link. Do not invent a four-step wizard.
5. Keep login fail-fast. Print short status lines. Failures non-zero.

## Alternatives

- Require git. Rejected: Railway folder `up` does not.
- Resume latest occupancy from any cwd. Rejected: that is the whoami bug.
- Fold project switch into `context use`. Rejected: that command is profile.
- Four-step wizard. Rejected by owner.

## Open Questions

None for this slice. GitHub Actions auto-deploy, production Cloud deploy,
setup-agent, and marketing remain out of scope.
