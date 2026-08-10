# Plan: Workspace Control TUI With Native Agent Handoff

## Governing Sources

- [ADR-094](../../decisions/ADR-094-agent-workspace-entry-workflow.md)
- [ADR-103](../../decisions/ADR-103-profile-aware-workspace-open-and-attach.md)
- [ADR-107](../../decisions/ADR-107-task-oriented-workspace-activation-presentation.md)
- [Spec 120](../120-profile-aware-workspace-open-and-attach/spec.md)
- [Spec 125](../125-workspace-code-activation/spec.md)
- [Spike issue #1024](https://github.com/appaloft/appaloft/issues/1024)
- [Workspace Control TUI Test Matrix](../../testing/workspace-control-tui-test-matrix.md)

## Architecture Approach

1. Keep a framework-neutral `WorkspaceControlPresentation` boundary in the CLI adapter for
   bounded list/detail state, selected identity, available capability-derived actions and refresh.
2. Use existing generated operation facade/local buses; do not import repositories or use cases.
3. Start the renderer only for interactive no-subcommand `workspace` mode.
4. For attach, destroy or suspend the outer renderer, invoke the existing managed-terminal/native
   attach bridge unchanged, then recreate and refresh the outer renderer after return.
5. Keep `--no-tui`, structured output and all subcommands outside the renderer module so missing
   native assets cannot break headless operation or help.
6. Treat OpenTUI imperative as the first candidate only after host and cross-target packaging tests
   prove native asset embedding; hide it behind the presentation boundary.

## CQRS, Read Model And Event Impact

- Commands/queries: reuse existing operations only.
- Read models: reuse bounded Workspace/Sandbox/Runtime/Terminal/Preview/Task descriptors.
- Events: none.
- Persistence: none.
- Errors: preserve existing structured operation/attach errors; renderer failures remain CLI
  presentation errors with a stable startup/restore phase and safe `--no-tui` recovery.

## Testing Strategy

- Entry/query/detail: `WS-TUI-ENTRY-001` through `WS-TUI-DETAIL-003`.
- Handoff/return/reconnect: `WS-TUI-HANDOFF-004` through `WS-TUI-RECONNECT-006` with a fake native
  attach transport and PTY-level integration coverage.
- Failure/fallback/capability: `WS-TUI-ERROR-007` through `WS-TUI-CAPABILITY-009`.
- Packaging/terminal/docs: `WS-TUI-PACKAGE-010` through `WS-TUI-DOCS-012`.
- Opt-in manual matrix: Terminal.app, iTerm2, Ghostty, VS Code Terminal and representative Linux
  terminals; no real provider is required for renderer/handoff ownership tests.

## Delivery Slices

1. Framework-neutral state/navigation model and headless-safe entry selection.
2. OpenTUI control shell list/detail presentation with host packaging tests.
3. Full-screen existing native attach handoff, return refresh and failure restoration.
4. macOS/Linux release matrix, terminal matrix, docs and Sync.

Each Ticket must be actor-visible and retain the full fallback path. File-level implementation
steps remain in `tasks.md`.

## Risks And Stop Conditions

- Stop if the renderer becomes an application service or stores lifecycle state.
- Stop if native handoff requires parsing/replaying Agent screen text.
- Stop if a supported artifact cannot embed/load the native renderer safely.
- Stop if terminal restoration cannot be proven on failure and signal paths.
- Split-pane demand returns to Spec/ADR because it requires a terminal-emulation ownership choice.
