# Research: Workspace Control TUI Hardest-Path Gate

## Purpose

This research defines a disposable framework gate for a future Workspace control TUI. It does not
authorize production TUI code and does not change Spec 125's `appaloft code` activation slice.

## Boundary Under Test

The outer presentation may render Appaloft-owned Workspace, Server, Profile, Terminal, Task,
Preview, Deployment, proof and recovery state. The Agent pane must remain the native Pi, OpenCode,
Claude Code, Codex or other Adapter-owned PTY/client.

The spike must not:

- add lifecycle state or TUI-only mutations;
- scrape terminal text into messages, tool calls or hidden reasoning;
- branch on Agent names instead of Adapter capabilities;
- persist credentials, terminal output or vendor session state as Appaloft conversation data.

## Candidate Order

1. Spike `@opentui/core` using its imperative API to match the Bun/TypeScript CLI.
2. Keep business operations and PTY transport behind framework-neutral interfaces.
3. If any required gate fails without a bounded upstream fix, choose a separate Rust/Ratatui
   frontend that consumes the same public operation and PTY contracts.

## Required Gates

| ID | Gate | Required evidence |
| --- | --- | --- |
| WS-TUI-SPIKE-001 | Release artifact | The same Bun compilation/release path used by Appaloft produces runnable supported macOS/Linux artifacts with the candidate dependency. |
| WS-TUI-SPIKE-002 | Nested Agent PTY | A representative managed-terminal Agent alternate screen renders in a pane without terminal scraping. |
| WS-TUI-SPIKE-003 | Terminal control | Resize/reflow, mouse, bracketed paste, focus transfer, Ctrl+C ownership and clean terminal restoration are deterministic. |
| WS-TUI-SPIKE-004 | Text correctness | CJK, emoji, combining marks and wide-character cursor movement render correctly. |
| WS-TUI-SPIKE-005 | Reconnect | Transport disconnect and reconnect preserve bounded replay cursor/scrollback without restarting a healthy Agent process. |
| WS-TUI-SPIKE-006 | Terminal matrix | Terminal.app, iTerm2, Ghostty, VS Code Terminal and representative Linux terminals satisfy the required interaction set. |
| WS-TUI-SPIKE-007 | Fallback | `--no-tui` and headless/machine-readable Workspace operations remain usable when the TUI cannot start. |

## Selection Rule

OpenTUI becomes an implementation dependency only if every required gate passes on the supported
release targets. Otherwise the presentation frontend changes; the public Workspace, operation,
Terminal and attach contracts do not.

## Deferred Questions

- Exact navigation, keymap, accessibility and theming belong to the future control-TUI Spec.
- Windows terminal and credential-store acceptance is a later platform gate.
- Exit-triggered Workspace cleanup and keep-awake policy are lifecycle behaviors, not framework
  research.
