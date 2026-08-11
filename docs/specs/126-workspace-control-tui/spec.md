# Workspace Control TUI With Embedded Native Agent

## Status

- Round: Code
- Artifact state: accepted through public PR
  [#1025](https://github.com/appaloft/appaloft/pull/1025); implementation tracked by public Ticket
  [#1026](https://github.com/appaloft/appaloft/issues/1026)
- Code changes allowed: yes, within Ticket #1026 and this accepted boundary
- Compatibility: additive presentation over existing public operations
- Renderer decision: replaceable Rust/Ratatui sidecar; the OpenTUI candidate failed the released
  public-API gate recorded by closed Spike [#1024](https://github.com/appaloft/appaloft/issues/1024)

## Business Outcome

An authenticated developer can run `appaloft workspace` in an interactive terminal, inspect
bounded Workspace state and operate the selected Adapter-owned native Agent inside an embedded
terminal pane. The developer can release focus to navigate Appaloft state or maximize the same live
Session to native full-screen, then return without duplicating lifecycle, conversation or
credential truth.

## Ubiquitous Language

| Term | Meaning |
| --- | --- |
| Workspace Control TUI | Appaloft-owned presentation over existing public operations and read models. |
| Control Shell | The outer Workspace list/detail/navigation renderer that remains available beside the Agent. |
| Embedded Agent Pane | Terminal-emulated rendering of the unmodified Agent-owned native screen. |
| Agent Focus | Input ownership held by the embedded Agent until one documented outer release chord is used. |
| Focus Mode | Same live Terminal Session or local PTY maximized to native full-screen, then returned to the embedded pane. |
| Return Refresh | Bounded re-read of exact Workspace state after focus or connection changes. |
| Terminal Viewport | Framework-neutral presentation port over a byte stream, input, resize, detach and close; it owns no Agent or Workspace lifecycle. |

## Requirements And Acceptance Criteria

| ID | Behavior | Given | When | Then |
| --- | --- | --- | --- | --- |
| WS-TUI-ENTRY-001 | Interactive management entry | stdin/stdout are interactive and no Workspace subcommand is supplied | `appaloft workspace` runs | The control shell starts without changing any Workspace. |
| WS-TUI-QUERY-002 | Existing state truth | Workspaces exist on the resolved control-plane target | the shell loads or refreshes | It uses bounded existing public queries/descriptors and creates no TUI projection, cache or table. |
| WS-TUI-DETAIL-003 | Actionable detail | A Workspace is selected | detail is rendered | Exact Workspace/Profile/Server, Runtime/Terminal, Preview and Task summary fields are rendered only when supplied by existing public contracts. |
| WS-TUI-EMBED-004 | Embedded native Agent | The selected Runtime declares managed-terminal or approved native attach | the Workspace is selected | The same Agent-native alternate screen renders inside a terminal-emulated pane; input/output is not converted into Appaloft messages, tools or reasoning. |
| WS-TUI-FOCUS-005 | Deterministic input ownership | The embedded Agent pane is focused | Agent keys or the outer release chord are entered | Bare keys remain Agent-owned; the one documented chord releases focus to the Control Shell without stopping or detaching the Agent. |
| WS-TUI-FULLSCREEN-006 | Same-session full-screen | An embedded Agent is running | Focus Mode is entered and later exited | The same Terminal Session or local PTY is maximized and returned to its pane without starting another Agent process or losing identity. |
| WS-TUI-RECONNECT-007 | Existing reconnect semantics | Transport disconnects while the Workspace/Agent remains healthy | the pane reconnects | Existing exact identity and bounded replay resume without restarting the Agent; the renderer owns no independent replay truth. |
| WS-TUI-ERROR-008 | Structured recovery | query, renderer, terminal parser, attach, resize or refresh fails | the failure is presented | Stable existing code/phase/evidence is preserved; terminal restoration and bounded detach run; secrets, raw host data and Agent output remain excluded. |
| WS-TUI-FALLBACK-009 | Headless compatibility | no TTY exists, `--no-tui` is supplied, machine output is requested, the host terminal is unsupported or the TUI cannot load | Workspace management runs | The renderer does not start; a stable fallback reason is returned and existing headless Workspace commands remain usable and unchanged. This compatibility path is not claimed as completion of the embedded experience. |
| WS-TUI-CAPABILITY-010 | Adapter neutrality | Pi, OpenCode, Claude Code, Codex or future adapters expose different attach capabilities | actions are rendered | Availability derives from declared capabilities and terminal contracts, never Agent-name checks or terminal scraping. |
| WS-TUI-PACKAGE-011 | Supported release artifacts | published CLI targets are built | each artifact starts | Headless help remains safe on every target; accepted macOS/Linux targets load required renderer assets and missing assets never damage terminal state. |
| WS-TUI-TERMINAL-012 | Terminal correctness | supported terminals exercise alternate screen, resize/reflow, mouse, focus, paste, signals, CJK, emoji and wide text | embedded and Focus modes run | Child semantics remain correct, outer focus is recoverable, and crash/signal cleanup restores the host terminal deterministically. |
| WS-TUI-DOCS-013 | Discoverable boundary | a user reads Workspace CLI help | help is resolved | Docs distinguish `workspace` embedded control, `code` activation, same-session Focus Mode, headless commands, Agent ownership and `--no-tui`. |

## Public Surfaces

- CLI: no-subcommand `appaloft workspace`; embedded Agent pane by default on accepted interactive
  targets; documented focus-release and same-session full-screen commands; presentation-only
  `--no-tui` behavior if not already covered by structured/headless selection.
- Existing CLI: `appaloft code`, `workspace open/list/show/connect/attach/terminate/...` remain.
- Host-terminal gate: Windows and missing, `dumb` or `unknown` `TERM` values return a stable
  `platform-unsupported` or `terminal-unsupported` headless reason before renderer startup.
- API/oRPC/SDK/MCP: no new operation; the shell consumes existing operations.
- Persistence/events/read models: none.
- Cloud: may inject existing authz, placement, custody and gateway ports only.

## Domain Ownership

- Workspace identity/lifecycle remains Sandbox-owned; `workspaceId === sandboxId`.
- Agent Runtime and attach capability remain SandboxAgentRuntime/Adapter-owned.
- Terminal Session owns PTY transport and bounded replay.
- Preview, Task, Server and Profile state stay with their existing public owners.
- The CLI adapter owns only navigation, focus, terminal viewport/renderer lifecycle and result
  presentation.

## Non-Goals

- Universal Agent conversation/message/tool model.
- Terminal text parsing into structured Agent semantics.
- New Workspace, Server, Session, Profile, Preview or Task operations.
- Workspace creation wizard, Server enrollment, `dev`, `ca`, keep-awake or exit-triggered removal.
- Windows embedded mode in the first production slice; published Windows CLI/help/headless behavior
  must remain safe and is separately gated before embedded enablement.
- Cloud-only behavior or private lifecycle state.

## Compatibility And Migration

- Additive presentation; no existing command is deprecated.
- Non-interactive and structured callers keep current behavior.
- The frontend framework can be replaced without changing operations or attach contracts.
- If the preferred renderer fails a required gate, replace the presentation frontend behind the
  same contracts; do not redefine full-screen handoff-only as the completed embedded experience.

## Open Questions

No question remains that changes the first-slice ownership or workflow. Exact visual styling and
non-release target enablement may evolve after the Spike; Server enrollment remains a separate
behavior.
