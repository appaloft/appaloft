# Tasks: Workspace Control Delivery Actions

## Spec Round

- [x] Record the owner-confirmed R1 delivery-control outcome and rejected alternatives.
- [x] Define exact existing operations, status-derived availability, form and confirmation bounds.
- [x] Define stable `WS-TUI-DELIVERY-*` Test Matrix ids and no-new-operation rationale.
- [x] Accept this Spec through public PR #1033 before Ticket or Code Round.

## Ticket

- [x] Create public issue #1034 linked to this Spec and every Test Matrix id.
- [x] Mark it `ready-for-agent` only after Spec acceptance and exact implementation paths are known.

## Test First

- [x] Add failing Rust palette/form/confirmation/busy-state tests.
- [x] Add failing Preview expose/revoke and exact selected-target validation tests.
- [x] Add failing Task approve/deliver and Promotion accept/retry dispatch tests.
- [x] Add failing authoritative Deployment Proof readback and safe-error tests.
- [x] Preserve and run headless/package compatibility regressions.

## Implementation

- [x] Extend the framework-neutral presentation contract with bounded delivery messages/events.
- [x] Implement parent-side exact target validation and existing operation dispatch.
- [x] Implement Ratatui delivery palette, forms, external-write confirmation and busy state.
- [x] Query real Deployment Proof for eligible Promotions and render bounded evidence counts.
- [x] Preserve exact Agent terminal identity and every current headless surface.

## Verification And Sync

- [x] Run focused Rust, CLI and renderer protocol tests.
- [x] Run public lint, typecheck, full test, build and release-boundary checks.
- [x] Update localized docs/help, ADR migration/verification links, operation map and traceability.
- [x] Merge public implementation through PR #1035, close Ticket #1034 and update the Cloud gitlink after independent
  boundary review.
