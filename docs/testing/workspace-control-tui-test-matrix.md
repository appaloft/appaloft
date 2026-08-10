# Workspace Control TUI Test Matrix

| ID | Layer | Scenario | Expected evidence | Planned binding | Status |
| --- | --- | --- | --- | --- | --- |
| WS-TUI-ENTRY-001 | CLI/unit | Interactive `appaloft workspace` has no subcommand | Renderer starts after target resolution with no mutation. | CLI command tests | planned |
| WS-TUI-QUERY-002 | CLI/contract | Shell loads and refreshes Workspaces | Only bounded existing operation facade calls occur; no repository/TUI store exists. | CLI control-presentation tests + import boundary | planned |
| WS-TUI-DETAIL-003 | CLI/unit | User selects a Workspace | Existing safe Workspace/Profile/Server/Runtime/Terminal/Preview/Task fields render without invented truth. | presentation snapshot/state tests | planned |
| WS-TUI-EMBED-004 | CLI/PTY | Selected Adapter exposes managed-terminal or approved native attach | Native alternate screen renders in the embedded pane from a transport-neutral byte stream; no Agent semantic parser exists. | fake TerminalViewport + real PTY integration | planned; revised spike required |
| WS-TUI-FOCUS-005 | CLI/PTY | Embedded Agent owns focus | Agent keys, outer release chord, mouse, paste and resize are exercised | Bare input stays child-owned; the documented chord returns navigation focus without stopping/detaching the Agent. | input encoder + PTY focus tests | planned |
| WS-TUI-FULLSCREEN-006 | CLI/PTY | Embedded Agent enters and exits Focus Mode | View transitions between pane and native full-screen | Exact Session/PTY and child process identity remain unchanged. | process/session identity + terminal lifecycle tests | planned |
| WS-TUI-RECONNECT-007 | CLI/integration | Healthy Workspace/Agent transport disconnects | Embedded pane reconnects | Existing exact identity and bounded replay semantics resume without restarting the Agent. | existing attach tests + viewport integration | planned |
| WS-TUI-ERROR-008 | CLI/contract | Query, renderer, parser, attach, resize or refresh fails | Stable safe error survives; renderer cleanup/detach runs once; Agent output/secrets are absent. | failure injection + terminal state assertions | planned |
| WS-TUI-FALLBACK-009 | CLI/package | No TTY, `--no-tui`, structured output or missing renderer asset | Renderer module is not initialized; existing headless commands/help remain usable without claiming embedded completion. | help-without-runtime + packaged fallback smoke | planned |
| WS-TUI-CAPABILITY-010 | CLI/unit | Pi/OpenCode/Claude Code/Codex/future Adapter descriptors differ | Action selection derives only from declared attach and terminal capabilities. | descriptor matrix tests | planned |
| WS-TUI-PACKAGE-011 | release | Published CLI artifacts start | Headless help is safe on every artifact; accepted macOS/Linux artifacts embed/load renderer assets and restore safely. | release workflow matrix | planned; host Spike partial |
| WS-TUI-TERMINAL-012 | PTY/e2e | Alternate screen, resize/reflow, focus, paste, mouse, signals and Unicode run across supported terminals | Embedded and Focus modes preserve child semantics and restore the host terminal after exit/crash. | automated PTY harness + opt-in real terminal matrix | planned; host outer-shell partial |
| WS-TUI-DOCS-013 | docs/contract | Workspace help is searched | Both locales explain embedded control, code activation, focus release, same-session full-screen and headless fallback. | docs registry + built link checks | planned |

## Research Evidence

OpenTUI 0.5.1 throwaway commit `26713855` and
[issue #1024](https://github.com/appaloft/appaloft/issues/1024) provide historical host-only
evidence. New upstream terminal-runtime work authorizes a revised throwaway Spike only. It does not
authorize a production dependency until the public embedded API and every required gate pass.
