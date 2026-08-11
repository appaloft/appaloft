# Tasks: Workspace Control Recovery And Cleanup Evidence

## Spec Round

- [x] Record the owner-confirmed R1 recovery/cleanup outcome and rejected alternatives.
- [x] Define existing operation reuse, evidence limits, confirmation and retention bounds.
- [x] Define stable `WS-TUI-RECOVERY-*` Test Matrix ids and no-new-operation/ADR rationale.
- [x] Accept this Spec through public PR #1039 before Ticket or Code Round.

## Ticket

- [x] Create public issue #1040 linked to this Spec and every Test Matrix id.
- [x] Mark it `ready-for-agent` only after Spec acceptance and exact implementation paths are known.

## Test First

- [x] Add failing safe mapping, bounded Snapshot filtering and cleanup-state tests.
- [x] Add failing exact selected-target validation and create/delete dispatch tests.
- [x] Add failing Rust palette/form/confirmation/busy-state tests.
- [x] Add same-Agent-Session and headless/package compatibility regressions.

## Implementation

- [x] Extend the framework-neutral detail/event protocol with bounded recovery/cleanup evidence.
- [x] Query existing Snapshot truth and dispatch existing Snapshot commands in the Bun parent.
- [x] Implement Ratatui recovery detail, fixed-retention form and confirmed delete action.
- [x] Preserve exact Agent terminal identity and every current headless surface.

## Verification And Sync

- [x] Run focused Rust, CLI and renderer protocol tests.
- [x] Run public lint, typecheck, full test, build and release-boundary checks.
- [x] Update localized docs/help, ADR links, operation map, registry and traceability.
- [ ] Merge public implementation, close the Ticket and update the Cloud gitlink after independent
  boundary review.
