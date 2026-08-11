# Tasks: Workspace Control Recovery And Cleanup Evidence

## Spec Round

- [x] Record the owner-confirmed R1 recovery/cleanup outcome and rejected alternatives.
- [x] Define existing operation reuse, evidence limits, confirmation and retention bounds.
- [x] Define stable `WS-TUI-RECOVERY-*` Test Matrix ids and no-new-operation/ADR rationale.
- [ ] Accept this Spec through public review before Ticket or Code Round.

## Ticket

- [ ] Create one public actor-visible issue linked to this Spec and every Test Matrix id.
- [ ] Mark it `ready-for-agent` only after Spec acceptance and exact implementation paths are known.

## Test First

- [ ] Add failing safe mapping, bounded Snapshot filtering and cleanup-state tests.
- [ ] Add failing exact selected-target validation and create/delete dispatch tests.
- [ ] Add failing Rust palette/form/confirmation/busy-state tests.
- [ ] Add same-Agent-Session and headless/package compatibility regressions.

## Implementation

- [ ] Extend the framework-neutral detail/event protocol with bounded recovery/cleanup evidence.
- [ ] Query existing Snapshot truth and dispatch existing Snapshot commands in the Bun parent.
- [ ] Implement Ratatui recovery detail, fixed-retention form and confirmed delete action.
- [ ] Preserve exact Agent terminal identity and every current headless surface.

## Verification And Sync

- [ ] Run focused Rust, CLI and renderer protocol tests.
- [ ] Run public lint, typecheck, full test, build and release-boundary checks.
- [ ] Update localized docs/help, ADR links, operation map, registry and traceability.
- [ ] Merge public implementation, close the Ticket and update the Cloud gitlink after independent
  boundary review.
