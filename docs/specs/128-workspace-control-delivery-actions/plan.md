# Plan: Workspace Control Delivery Actions

## Delivery Sequence

1. Accept Discovery, Spec, Tasks and Test Matrix before Ticket or Code.
2. Create one actor-visible public Ticket linked to every `WS-TUI-DELIVERY-*` id.
3. Add RED Rust state/protocol tests for palette, forms, confirmation and duplicate-submit safety.
4. Add RED Bun presentation tests for exact target validation, existing command dispatch, proof
   query readback and safe failures.
5. Implement renderer-neutral delivery action descriptors and operation dispatch in the Bun parent.
6. Implement the bounded Ratatui palette/forms/confirmation without domain or credential logic.
7. Preserve headless CLI and packaged artifact behavior.
8. Update localized docs/help, traceability and operation map during Code/Sync Round.
9. Run focused Rust/CLI/protocol tests, public lint/typecheck/test/build and six-target TUI release
   checks.

## Public/Private Boundary Verification

- New source stays in the public CLI adapter and replaceable Rust renderer.
- Only existing `@appaloft/application` messages are dispatched.
- No public import references Cloud; no Cloud table, DTO, service or adapter is needed.
- Cloud adoption is a final public gitlink update after the public PR is merged.

## Rollback

The behavior is additive. Reverting the presentation commit removes the `d` palette while all
headless Preview, Task, Promotion and proof operations remain available and unchanged.

