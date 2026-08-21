# Railway-Like Folder Onboarding Plan

## Architecture

- CLI presentation owns folder-link persistence and first-command create/select.
- Existing `projects.create` / `projects.list` / `projects.show` remain the only
  write/read operations.
- Occupancy identity for a no-git folder is `folder.local/cwd/<name>`.
- `workspaces.open` skips git fetch for that identity.
- Community activation uses Resource source `local-folder` for folder identity.

## CQRS And Persistence

No new command, query, table, or catalog entry. Folder links are a CLI user-file
(`folder-links.json`) keyed by normalized cwd.

## Entrypoints

- `appaloft deploy` and `appaloft code` call folder onboarding before existing
  admission / `workspaces.open`.
- TTY `code` onboarding inquires on the normal screen first (Continue →
  create+link a Project named after the directory), then enters Cloud Agents.
  `--yes` / no TTY creates without that inquire. It must not silently
  create+link on a TTY, and must not overlay an Effect folder-not-linked
  selector on Cloud Agents.
- `appaloft project use` writes the folder link after `projects.show`.
- `project show` without an id prefers the folder link over latest occupancy.

## Test Strategy

- Pure decision tests for create / git identity / reuse / switch / single
  project / TTY vs `--yes`.
- Door tests: no-git folder occupy; git remote identity; no whoami resume;
  login fail-fast.
- CLI tests: second command reuses link; `project use` changes later commands.
- Application tests: folder identity skips fetch; Resource source is
  `local-folder`.

## Risks

- Existing deploy tests run from this git checkout and will see a real origin.
  Mocks must key repository bindings by identity.
- Login check applies only to remote execution target so local PGlite deploy
  still works without Cloud login.
