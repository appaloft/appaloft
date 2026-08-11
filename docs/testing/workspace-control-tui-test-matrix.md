# Workspace Control TUI Test Matrix

| ID | Layer | Scenario | Expected evidence | Planned binding | Status |
| --- | --- | --- | --- | --- | --- |
| WS-TUI-ENTRY-001 | CLI/unit | Interactive `appaloft workspace` has no subcommand | Renderer starts after target resolution with no mutation. | `agent-workspace-command.test.ts` | automated pass |
| WS-TUI-QUERY-002 | CLI/contract | Shell loads and refreshes Workspaces | Only bounded existing operation facade calls occur; no repository/TUI store exists. | `workspace-control-presentation.test.ts` + import boundary | automated pass |
| WS-TUI-DETAIL-003 | CLI/unit | User selects a Workspace | Existing safe Workspace/Profile/Server/Runtime/Terminal/Preview/Task fields render without invented truth. | TypeScript safe mapping + Ratatui bounded-detail render test | automated pass |
| WS-TUI-EMBED-004 | CLI/PTY | Selected Adapter exposes managed-terminal or approved native attach | Native alternate screen renders in the embedded pane from a transport-neutral byte stream; no Agent semantic parser exists. | fake `TerminalSession`, real `Bun.Terminal`, compiled Ratatui sidecar | automated macOS/Linux pass |
| WS-TUI-FOCUS-005 | CLI/PTY | Embedded Agent owns focus | Agent keys, outer release chord, mouse, paste and resize are exercised | Bare input stays child-owned; the documented chord returns navigation focus without stopping/detaching the Agent. | Rust input encoder/state tests + real sidecar PTY + host-terminal smoke | automated pass; focus-release hint remains visible at 80 columns; Terminal.app, Ghostty, VS Code Terminal, Linux xterm and Codex PTY pass; iTerm2 pending |
| WS-TUI-FULLSCREEN-006 | CLI/PTY | Embedded Agent enters and exits Focus Mode | View transitions between pane and native full-screen | Exact Session/PTY and child process identity remain unchanged. | Rust state identity + presentation reconnect tests | automated pass |
| WS-TUI-RECONNECT-007 | CLI/integration | Healthy Workspace/Agent transport disconnects | Embedded pane reconnects | Existing exact identity and bounded replay semantics resume without restarting the Agent. | exact managed Session reattach + bounded renderer retry tests | automated pass |
| WS-TUI-ERROR-008 | CLI/contract | Query, renderer, parser, attach, resize or refresh fails | Stable safe error survives; renderer cleanup/detach runs once; Agent output/secrets are absent. | invalid auth, early exit, safe error, exact detach and SIGTERM restore tests | automated pass |
| WS-TUI-FALLBACK-009 | CLI/package | No TTY, `--no-tui`, structured output, unsupported host terminal or missing renderer asset | Renderer module is not initialized; a stable reason is returned and existing headless commands/help remain usable without claiming embedded completion. | source help/headless tests + terminal capability gate + packaged fallback smoke | source and packaged macOS automated pass; missing/`dumb`/`unknown` `TERM` and Windows fail closed before renderer startup |
| WS-TUI-CAPABILITY-010 | CLI/unit | Pi/OpenCode/Claude Code/Codex/future Adapter descriptors differ | Action selection derives only from declared attach and terminal capabilities. | managed/native/future descriptor tests | automated pass |
| WS-TUI-PACKAGE-011 | release | Published CLI artifacts start | Headless help is safe on every artifact; accepted macOS/Linux artifacts embed/load renderer assets and restore safely. | six-target release workflow + bundle tests | six CI targets pass; local macOS and Linux packaged smoke pass |
| WS-TUI-TERMINAL-012 | PTY/e2e | Alternate screen, resize/reflow, focus, paste, mouse, signals and Unicode run across supported terminals | Embedded and Focus modes preserve child semantics and restore the host terminal after exit/crash. | automated real PTY/sidecar + opt-in real terminal/Agent matrix + `smoke:workspace-tui:host-terminal` | automated macOS/Linux pass; provider-free Pi/OpenCode/Codex/Claude Code PTY matrix pass; Terminal.app 470.2, Ghostty 1.3.1, VS Code 1.132.0 integrated terminal, Linux xterm 390 and Codex PTY pass; iTerm2 pending |
| WS-TUI-DOCS-013 | docs/contract | Workspace help is searched | Both locales explain embedded control, code activation, focus release, same-session full-screen and headless fallback. | docs registry + built link checks | automated pass |

## Research Evidence

The durable host-terminal run summary is
[`workspace-control-tui-host-terminal-evidence-2026-08-11.md`](workspace-control-tui-host-terminal-evidence-2026-08-11.md).

OpenTUI 0.5.1 throwaway commit `26713855` is historical negative evidence. Revised throwaway commit
`5bb1f3ac` against OpenTUI PR #1340 proves the host architecture and six-target build matrix, but
the required public embedded API remained unreleased and teardown still required explicit process
exit after the soak. Closed [Spike #1024](https://github.com/appaloft/appaloft/issues/1024) therefore
selected the replaceable Rust/Ratatui production renderer without changing the presentation or
terminal contracts. Ticket #1026 now has six-target macOS/Linux build evidence plus local packaged
PTY evidence for embedded startup, Focus Mode, signal restoration and headless fallback. An opt-in
provider-free matrix also traverses the native PTY with installed Pi, OpenCode, Codex and Claude
Code clients. The repeatable host-terminal smoke records alternate-screen entry/leave, mouse and
bracketed-paste enable/disable, Workspace rendering and visible focus release without provider
calls. It passes in Terminal.app 470.2, a real VS Code 1.132.0 integrated terminal launched from an
isolated Extension Development Host, and the Codex xterm-compatible PTY. The VS Code run used
isolated user-data and extension directories and left no process running. A Linux x64 production
sidecar also passes under Debian xterm 390 on Xvfb. The signed Ghostty 1.3.1 app passes directly
from a temporary directory and leaves no running process or installed application. iTerm2 3.6.11
has a verified official archive and valid code signature, but its command entry does not create a
Session outside `/Applications` on the current host. The supported host-terminal matrix therefore
remains open pending explicit authorization for a temporary install-and-remove acceptance run.

Run the provider-free installed-client matrix with `bun run smoke:workspace-tui:agents`. It starts
only each client's local help surface through the production `Bun.Terminal` adapter; it does not
send a prompt or call a model provider.

Run the host-terminal matrix from the terminal under test with
`bun run smoke:workspace-tui:host-terminal --renderer <renderer> --evidence <path>
--expect-terminal-program <name>`. The evidence file contains only terminal metadata and boolean
checks; it does not record rendered Workspace or Agent content.
