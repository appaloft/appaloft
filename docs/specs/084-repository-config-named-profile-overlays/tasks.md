# Repository Config Named Profile Overlays Tasks

- [x] Add ADR-075 for named config profile overlays.
- [x] Add feature artifact spec and plan.
- [x] Update deployment config workflow and test matrix rows.
- [x] Update public config-file docs, GitHub Action docs, and AI-facing deploy skill references.
- [x] Add parser/schema and JSON schema support for `profiles.<key>`.
- [x] Add selected profile merge helper and CLI/Action selection.
- [x] Add automated tests:
  - [x] `CONFIG-FILE-NAMED-PROFILE-001`: named profile overlay is accepted.
  - [x] `CONFIG-FILE-NAMED-PROFILE-002`: identity/unknown/unsafe fields are rejected.
  - [x] `CONFIG-FILE-NAMED-PROFILE-003`: unselected profiles are ignored.
  - [x] `CONFIG-FILE-NAMED-PROFILE-004`: selected profile applies before ids-only deployment.
  - [x] `CONFIG-FILE-NAMED-PROFILE-005`: missing selected profile fails before mutation.
  - [x] `CONFIG-FILE-NAMED-PROFILE-006`: trusted flags override selected profile values.
- [x] Run targeted tests and typechecks.
- [ ] Post-Implementation Sync and PR update.
