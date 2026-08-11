# Tasks: Workspace Control Delivery Actions

## Spec Round

- [x] Record the owner-confirmed R1 delivery-control outcome and rejected alternatives.
- [x] Define exact existing operations, status-derived availability, form and confirmation bounds.
- [x] Define stable `WS-TUI-DELIVERY-*` Test Matrix ids and no-new-operation rationale.
- [ ] Accept this Spec through public review before Ticket or Code Round.

## Ticket

- [ ] Create one public actor-visible issue linked to this Spec and every Test Matrix id.
- [ ] Mark it `ready-for-agent` only after Spec acceptance and exact implementation paths are known.

## Test First

- [ ] Add failing Rust palette/form/confirmation/busy-state tests.
- [ ] Add failing Preview expose/revoke and exact selected-target validation tests.
- [ ] Add failing Task approve/deliver and Promotion accept/retry dispatch tests.
- [ ] Add failing authoritative Deployment Proof readback and safe-error tests.
- [ ] Add headless/package compatibility regressions.

## Implementation

- [ ] Extend the framework-neutral presentation contract with bounded delivery messages/events.
- [ ] Implement parent-side exact target validation and existing operation dispatch.
- [ ] Implement Ratatui delivery palette, forms, external-write confirmation and busy state.
- [ ] Query real Deployment Proof for eligible Promotions and render bounded evidence counts.
- [ ] Preserve exact Agent terminal identity and every current headless surface.

## Verification And Sync

- [ ] Run focused Rust, CLI and renderer protocol tests.
- [ ] Run public lint, typecheck, full test, build and release-boundary checks.
- [ ] Update localized docs/help, ADR migration/verification links, operation map and traceability.
- [ ] Merge public implementation, close the Ticket and update the Cloud gitlink after independent
  boundary review.

