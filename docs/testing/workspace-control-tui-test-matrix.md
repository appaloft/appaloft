# Workspace Control TUI Test Matrix

| ID | Layer | Scenario | Expected evidence | Planned binding | Status |
| --- | --- | --- | --- | --- | --- |
| WS-TUI-ENTRY-001 | CLI/unit | Interactive `appaloft workspace` has no subcommand | Renderer starts after target resolution with no mutation. | `agent-workspace-command.test.ts` | automated pass |
| WS-TUI-QUERY-002 | CLI/contract | Shell loads and refreshes Workspaces | Only bounded existing operation facade calls occur; no repository/TUI store exists. | `workspace-control-presentation.test.ts` + import boundary | automated pass |
| WS-TUI-DETAIL-003 | CLI/unit | User selects a Workspace | Existing safe Workspace/Profile/Server/Runtime/Terminal/Preview/Task fields render without invented truth. | TypeScript safe mapping + Ratatui bounded-detail render test | automated pass |
| WS-TUI-EMBED-004 | CLI/PTY | Selected Adapter exposes managed-terminal or approved native attach | Native alternate screen renders in the embedded pane from a transport-neutral byte stream; no Agent semantic parser exists. | fake `TerminalSession`, real `Bun.Terminal`, compiled Ratatui sidecar | automated macOS pass; Linux CI pending |
| WS-TUI-FOCUS-005 | CLI/PTY | Embedded Agent owns focus | Agent keys, outer release chord, mouse, paste and resize are exercised | Bare input stays child-owned; the documented chord returns navigation focus without stopping/detaching the Agent. | Rust input encoder/state tests + real sidecar PTY | automated pass; opt-in terminal matrix pending |
| WS-TUI-FULLSCREEN-006 | CLI/PTY | Embedded Agent enters and exits Focus Mode | View transitions between pane and native full-screen | Exact Session/PTY and child process identity remain unchanged. | Rust state identity + presentation reconnect tests | automated pass |
| WS-TUI-RECONNECT-007 | CLI/integration | Healthy Workspace/Agent transport disconnects | Embedded pane reconnects | Existing exact identity and bounded replay semantics resume without restarting the Agent. | exact managed Session reattach + bounded renderer retry tests | automated pass |
| WS-TUI-ERROR-008 | CLI/contract | Query, renderer, parser, attach, resize or refresh fails | Stable safe error survives; renderer cleanup/detach runs once; Agent output/secrets are absent. | invalid auth, early exit, safe error, exact detach and SIGTERM restore tests | automated pass |
| WS-TUI-FALLBACK-009 | CLI/package | No TTY, `--no-tui`, structured output or missing renderer asset | Renderer module is not initialized; existing headless commands/help remain usable without claiming embedded completion. | source help/headless tests + packaged fallback smoke | source and packaged macOS automated pass |
| WS-TUI-CAPABILITY-010 | CLI/unit | Pi/OpenCode/Claude Code/Codex/future Adapter descriptors differ | Action selection derives only from declared attach and terminal capabilities. | managed/native/future descriptor tests | automated pass |
| WS-TUI-PACKAGE-011 | release | Published CLI artifacts start | Headless help is safe on every artifact; accepted macOS/Linux artifacts embed/load renderer assets and restore safely. | six-target release workflow + bundle tests | workflow wired; local macOS archive/smoke pass; Linux CI pending |
| WS-TUI-TERMINAL-012 | PTY/e2e | Alternate screen, resize/reflow, focus, paste, mouse, signals and Unicode run across supported terminals | Embedded and Focus modes preserve child semantics and restore the host terminal after exit/crash. | automated real PTY/sidecar + opt-in real terminal/Agent matrix | automated macOS normal/signal pass; Linux CI and opt-in matrix pending |
| WS-TUI-DOCS-013 | docs/contract | Workspace help is searched | Both locales explain embedded control, code activation, focus release, same-session full-screen and headless fallback. | docs registry + built link checks | automated pass |

## Research Evidence

OpenTUI 0.5.1 throwaway commit `26713855` is historical negative evidence. Revised throwaway commit
`5bb1f3ac` against OpenTUI PR #1340 proves the host architecture and six-target build matrix, but
the required public embedded API remained unreleased and teardown still required explicit process
exit after the soak. Closed [Spike #1024](https://github.com/appaloft/appaloft/issues/1024) therefore
selected the replaceable Rust/Ratatui production renderer without changing the presentation or
terminal contracts. Ticket #1026 must still close the Appaloft artifact, Linux CI and opt-in
terminal/Agent evidence before Sync. Local macOS source and packaged PTY evidence now covers
embedded startup, Focus Mode, signal restoration and headless fallback; Linux artifact evidence
and the opt-in real terminal/Agent matrix remain open.
