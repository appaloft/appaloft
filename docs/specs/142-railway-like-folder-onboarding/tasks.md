# Railway-Like Folder Onboarding Tasks

- [x] Record owner Grill decisions in discovery and ADR-122.
- [x] Write spec, plan, tasks, and test matrix.
- [x] Position the behavior in the business operation map as CLI presentation.
- [x] Implement folder-link store and onboarding decision.
- [x] Wire `deploy`, `code`, and `project use`.
- [x] Skip git fetch, `git init`, clone, and source materialization for folder occupancy; use `local-folder` source. Leftover partial folder occupancy continues. Logged-in `code --no-attach` must not POST the remote `workspaces.open` clone path.
- [x] Update Spec 139 resume rows that conflict.
- [x] Add CLI/application tests for the acceptance rows.
- [x] Update public docs, docs-registry, and skill entrypoints.
- [x] Run focused tests, `lint:ci`, and affected-package `typecheck`.
- [x] Open a merge-quality PR against main.
- [x] Live-walk fix: `code` TUI auto-creates/links by directory name; no Effect folder-not-linked selector inside Cloud Agents (`FOLDER-ONBOARD-009`).
- [x] Product lock: first chrome is Appaloft Cloud Agents + preparing the agent; missing/rustup-broken renderer restores the TTY before the human message; no Occupancy; no rustup cargo-chooser dump.
