# Plan: Workspace Control Recovery And Cleanup Evidence

## Delivery Sequence

1. Accept Discovery, Spec, Tasks and Test Matrix before Ticket or Code.
2. Create one actor-visible public Ticket linked to every `WS-TUI-RECOVERY-*` id.
3. Add RED Bun mapping/query/target-validation and existing-command dispatch tests.
4. Add RED Rust recovery-detail, palette, form, confirmation and duplicate-submit tests.
5. Extend the framework-neutral detail/event protocol with bounded recovery and cleanup evidence.
6. Query existing Snapshot truth and dispatch existing create/delete commands in the Bun parent.
7. Implement the Ratatui recovery detail and Recovery palette without domain/provider logic.
8. Preserve native Agent identity and every headless Workspace/Sandbox surface.
9. Update localized Workspace docs, help registry, ADR migration/verification links, operation map
   and traceability during Code/Sync Round.
10. Run focused Rust/CLI/protocol tests, public lint/typecheck/test/build and package checks.

## Public/Private Boundary Verification

- New source stays in the public CLI adapter and replaceable Rust renderer.
- Only existing `@appaloft/application` messages are dispatched.
- No public import references Cloud; no Cloud table, DTO, service, adapter or projection is needed.
- Cloud adoption is a final public gitlink update after the public PR is merged.

## Docs Round Outcome

- User-facing: yes.
- Reuse stable topic `agent.workspace-control` and anchor `workspace-control-tui`.
- Update both `apps/docs/src/content/docs/agents/workspaces.mdx` and
  `apps/docs/src/content/docs/en/agents/workspaces.mdx`.
- Update the docs-registry description, aliases and Spec/Test Matrix references in the Code/Sync
  Round; locale coverage remains complete.

## Rollback

The behavior is additive. Reverting the presentation commit removes the `s` palette and recovery
detail while all headless Sandbox/Snapshot/lifecycle operations remain available and unchanged.
