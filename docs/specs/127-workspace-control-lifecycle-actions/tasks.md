# Tasks: Workspace Control Lifecycle Actions

## Spec Round

- [x] Record the owner-confirmed R1 lifecycle-action slice and alternatives.
- [x] Define exact existing operations, status-derived availability and confirmation boundary.
- [x] Define stable Test Matrix ids and no-new-operation rationale.
- [x] Accept this Spec through public PR #1030 before Ticket or Code Round.

## Ticket

- [x] Create public issue #1031 linked to this Spec and every `WS-TUI-ACTION-*` id.
- [x] Mark issue #1031 `ready-for-agent` only after Spec acceptance.

## Test First

- [x] Add failing renderer state/protocol tests for palette, cancel and terminate confirmation.
- [x] Add failing presentation tests for pause/resume, detach order and runtime-first termination.
- [x] Add failing safe-error/readback and headless compatibility regressions.

## Implementation

- [x] Implement status-derived lifecycle action state in the Rust renderer.
- [x] Dispatch existing lifecycle commands from the Bun parent presentation.
- [x] Share runtime-first termination orchestration with the existing headless command.
- [x] Refresh bounded list/detail after success without optimistic lifecycle truth.

## Verification And Sync

- [x] Run focused Rust, CLI and protocol tests.
- [x] Run public lint, typecheck, test, build and release-boundary checks.
- [x] Sync Spec, tasks, Test Matrix, docs/help and evidence.
