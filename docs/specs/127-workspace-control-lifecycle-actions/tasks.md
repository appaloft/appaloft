# Tasks: Workspace Control Lifecycle Actions

## Spec Round

- [x] Record the owner-confirmed R1 lifecycle-action slice and alternatives.
- [x] Define exact existing operations, status-derived availability and confirmation boundary.
- [x] Define stable Test Matrix ids and no-new-operation rationale.
- [ ] Accept this Spec through a public PR before Ticket or Code Round.

## Ticket

- [ ] Create one actor-visible public issue linked to this Spec and every `WS-TUI-ACTION-*` id.
- [ ] Mark the issue `ready-for-agent` only after Spec acceptance.

## Test First

- [ ] Add failing renderer state/protocol tests for palette, cancel and terminate confirmation.
- [ ] Add failing presentation tests for pause/resume, detach order and runtime-first termination.
- [ ] Add failing safe-error/readback and headless compatibility regressions.

## Implementation

- [ ] Implement capability-derived lifecycle action state in the Rust renderer.
- [ ] Dispatch existing lifecycle commands from the Bun parent presentation.
- [ ] Share runtime-first termination orchestration with the existing headless command.
- [ ] Refresh bounded list/detail after success without optimistic lifecycle truth.

## Verification And Sync

- [ ] Run focused Rust, CLI and protocol tests.
- [ ] Run public lint, typecheck, test, build and release-boundary checks.
- [ ] Sync Spec, tasks, Test Matrix, docs/help and evidence.

