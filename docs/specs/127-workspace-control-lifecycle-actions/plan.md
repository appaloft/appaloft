# Plan: Workspace Control Lifecycle Actions

## Governing Sources

- [ADR-107](../../decisions/ADR-107-task-oriented-workspace-activation-presentation.md)
- [Spec 126](../126-workspace-control-tui/spec.md)
- [Workspace Control Lifecycle Actions Test Matrix](../../testing/workspace-control-lifecycle-actions-test-matrix.md)

## Architecture Approach

1. Extend the framework-neutral renderer protocol with lifecycle action and confirmation events.
2. Compute presentation availability from the selected public Workspace status.
3. Keep command dispatch in the Bun parent presentation; the Rust renderer receives no buses,
   credentials or provider handles.
4. Extract the existing headless runtime-first Workspace termination orchestration into a shared
   CLI adapter helper and reuse it from both surfaces.
5. Detach the active viewport before pause/terminate, execute exact existing commands, then perform
   bounded list/detail readback.
6. Keep renderer confirmation state ephemeral and keep application validation authoritative.

## Test-First Slices

1. Protocol/state tests for action availability, navigation, cancel and explicit terminate confirm.
2. Presentation tests for exact pause/resume commands, runtime-first termination and detach order.
3. Failure/readback tests proving stable safe errors and no optimistic truth.
4. Headless regression, Rust renderer tests, package/release checks and docs sync.

## Stop Conditions

- Stop if the renderer needs a command bus, repository or provider adapter.
- Stop if TUI and headless termination order diverge.
- Stop if a destructive mutation can run without explicit confirmation.
- Stop if action completion is displayed without public query readback.

