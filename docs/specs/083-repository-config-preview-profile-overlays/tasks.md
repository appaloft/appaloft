# Repository Config Preview Profile Overlays Tasks

- [x] Add ADR-074 for selected preview profile overlays.
- [x] Add feature artifact spec and plan.
- [x] Update deployment config workflow and test matrix rows.
- [x] Update public config-file docs and AI-facing deploy skill references.
- [x] Add parser/schema and JSON schema support for `preview.pullRequest.profile`.
- [x] Add effective config merge helper and CLI selection.
- [x] Add automated tests:
  - [x] `CONFIG-FILE-PREVIEW-OVERLAY-001`: preview profile overlay is accepted.
  - [x] `CONFIG-FILE-PREVIEW-OVERLAY-002`: identity/unknown/unsafe fields are rejected.
  - [x] `CONFIG-FILE-PREVIEW-OVERLAY-003`: ordinary deploy ignores preview overlay.
  - [x] `CONFIG-FILE-PREVIEW-OVERLAY-004`: PR preview applies overlay before ids-only deployment.
- [x] Run targeted tests and typechecks.
- [x] Post-Implementation Sync and PR update.
