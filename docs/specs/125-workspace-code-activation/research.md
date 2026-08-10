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
2. Use `Bun.Terminal` for local child PTY/ConPTY and the existing Appaloft `TerminalSession` for
   managed remote byte streams behind one framework-neutral terminal viewport.
3. Keep business operations, process ownership and PTY transport outside the renderer.
4. If the released OpenTUI API fails a required gate, choose a separate Rust/Ratatui frontend that
   consumes the same public operation and terminal contracts.

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
| WS-TUI-SPIKE-008 | Same-session Focus Mode | Embedded and native full-screen views share one live Session/PTY and Agent process. |
| WS-TUI-SPIKE-009 | Sustained operation | A 30-60 minute soak and burst-output run records CPU, memory, input latency and screen integrity. |

## Selection Rule

OpenTUI becomes an implementation dependency only after its embedded-terminal API is publicly
released and every required gate passes on supported release targets. An unreleased commit may be
used only on the throwaway Spike branch. Otherwise the presentation frontend changes; the public
Workspace, operation, Terminal and attach contracts do not.

## 2026-08-10 Spike Result

Public issue [#1024](https://github.com/appaloft/appaloft/issues/1024) and throwaway commit
`26713855` tested OpenTUI 0.5.1. The macOS arm64 host passed Bun standalone compilation, outer-shell
Unicode rendering, deterministic `q` teardown and `--no-tui`. OpenTUI exposes no terminal-emulator
or PTY renderable for nesting an arbitrary Agent alternate screen, so `WS-TUI-SPIKE-002` is blocked
and an embedded/split-pane production dependency is rejected.

That result is historical evidence for the released 0.5.1 API, not a durable product decision.
Railway's public implementation subsequently confirmed that its management tree and Agent TUI
coexist by feeding a PTY through a terminal emulator, while native full-screen is an optional
same-session mode.

## 2026-08-10 Upstream Reassessment

- OpenTUI PR #1338 merged an internal Ghostty VT runtime with persistent parsing, resize, scroll,
  input encoding and PTY replies.
- OpenTUI PR #1340 proposes the public embedded-terminal renderable, including terminal-state
  drawing, focus, input, paste, mouse, resize, cursor and cleanup. It remains unreleased.
- `Bun.Terminal` supplies local PTY/ConPTY process transport; the current Appaloft
  `TerminalSession` contract already supplies managed output, input, resize, detach and close.

The next Spike therefore tests OpenTUI's emerging embedded surface against both byte-stream
adapters and representative Pi, OpenCode, Codex and Claude Code terminal behavior. It does not
change dependencies or production code. Spec 126 requires embedded-by-default Workspace mode plus
same-session full-screen Focus Mode; handoff-only is no longer an acceptable final implementation.

## Deferred Questions

- Exact visual styling, accessibility details and non-reserved navigation keys belong to the
  implementation design under Spec 126; focus-release ownership is already normative.
- Windows terminal and credential-store acceptance is a later platform gate.
- Exit-triggered Workspace cleanup and keep-awake policy are lifecycle behaviors, not framework
  research.

## Primary References

- <https://github.com/anomalyco/opentui/pull/1338>
- <https://github.com/anomalyco/opentui/pull/1340>
- <https://bun.com/docs/runtime/child-process#terminal-pty-support>
- <https://github.com/railwayapp/cli/blob/master/src/commands/cloud_agent/tui/session.rs>
- <https://github.com/railwayapp/cli/blob/master/src/commands/cloud_agent/tui/ui.rs>
