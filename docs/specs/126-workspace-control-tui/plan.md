# Plan: Workspace Control TUI With Embedded Native Agent

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
   bounded list/detail state, selected identity, capability-derived actions and refresh.
2. Use existing generated operation facade/local buses; do not import repositories or use cases.
3. Start the renderer only for interactive no-subcommand `workspace` mode.
4. Define a `TerminalViewport` presentation port over output bytes, input, resize, detach and close.
   Adapt the existing managed `TerminalSession` directly; adapt a declared native local client
   through `Bun.Terminal` without moving process or lifecycle ownership into the renderer.
5. Render the Agent's native terminal state inside the Workspace layout. Keep one explicit outer
   focus-release chord; forward bare keys, mouse, paste, focus and resize to the child while focused.
6. Implement Focus Mode as a view transition over the same live Session/PTY. Do not launch a second
   Agent or create a second Workspace/Terminal lifecycle.
7. Keep `--no-tui`, structured output and all subcommands outside the renderer module so missing
   native assets cannot break headless operation or help.
8. Treat OpenTUI + its embedded terminal renderable as the preferred candidate only after the API
   is released and the shared gates pass. A disposable Spike may test upstream main/PR evidence;
   production code may not pin an unmerged commit. Keep Rust/Ratatui replaceable behind the same
   presentation and byte-stream boundaries.

## CQRS, Read Model And Event Impact

- Commands/queries: reuse existing operations only.
- Read models: reuse bounded Workspace/Sandbox/Runtime/Terminal/Preview/Task descriptors.
- Events: none.
- Persistence: none.
- Errors: preserve existing structured operation/attach errors; renderer/parser failures remain
  CLI presentation errors with stable startup/restore phases and safe `--no-tui` recovery.

## Roadmap And Compatibility

- Product position: next public Agent Workspace presentation slice after `appaloft code` activation
  and registered-VPS acceptance.
- Version impact: backward-compatible new CLI presentation; expected minor release impact.
- Existing CLI/API/oRPC/SDK contracts, structured output and headless commands remain unchanged.
- Public docs/help and release notes become required only when Code Round enables the command.

## Testing Strategy

- Entry/query/detail: `WS-TUI-ENTRY-001` through `WS-TUI-DETAIL-003`.
- Embedded/focus/full-screen/reconnect: `WS-TUI-EMBED-004` through `WS-TUI-RECONNECT-007` with fake
  byte streams plus PTY-level integration coverage.
- Failure/fallback/capability: `WS-TUI-ERROR-008` through `WS-TUI-CAPABILITY-010`.
- Packaging/terminal/docs: `WS-TUI-PACKAGE-011` through `WS-TUI-DOCS-013`.
- Opt-in manual matrix: Terminal.app, iTerm2, Ghostty, VS Code Terminal and representative Linux
  terminals; real Pi/OpenCode/Codex/Claude Code fixtures cover representative alternate-screen,
  approval/editor and signal behavior without requiring a paid provider call.

## Delivery Slices

1. Framework-neutral state/navigation model, `TerminalViewport` and headless-safe entry selection.
2. Embedded managed `TerminalSession` and local `Bun.Terminal` adapters with deterministic focus,
   resize and cleanup tests.
3. OpenTUI Workspace layout plus embedded Agent pane only after the dependency gate passes.
4. Same-session Focus Mode, reconnect, return refresh and failure restoration.
5. macOS/Linux release matrix, all-published-artifact safety, terminal matrix, docs and Sync.

Each Ticket must be actor-visible and retain the full fallback path. File-level implementation
steps remain in `tasks.md`.

## Risks And Stop Conditions

- Stop if the renderer becomes an application service or stores lifecycle state.
- Stop if embedded rendering requires parsing Agent screen text into conversation/tool semantics.
- Stop if embedded and Focus modes create different Agent processes or Session identities.
- Stop if a supported artifact cannot embed/load the native renderer safely.
- Stop if terminal restoration cannot be proven on failure and signal paths.
- Stop OpenTUI production adoption if the public embedded API is unreleased or any P0 gate fails;
  compare/choose the Rust presentation without changing the product contract.
