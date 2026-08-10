# Discovery: Workspace Control TUI With Embedded Native Agent

## Business Outcome

A developer can run `appaloft workspace` to inspect and select existing Agent Workspaces while the
selected Agent's native TUI runs inside the same Appaloft-owned control surface. The developer can
release focus to navigate Workspace state or maximize the same live Session without learning
internal ids, restarting the Agent or adopting a second conversation UI.

## Existing Evidence

- ADR-094/103 and Specs 111/120 own Workspace identity, create-or-resume, Profile selection,
  Terminal Session and capability-driven attach.
- ADR-107 and Spec 125 reserve a no-subcommand `appaloft workspace` presentation while keeping
  `appaloft code` and headless Workspace commands canonical and scriptable.
- Public issue [#1024](https://github.com/appaloft/appaloft/issues/1024) captured the OpenTUI 0.5.1
  hardest-path spike on throwaway commit `26713855`.
- The first spike passed a host Bun-compiled shell, CJK/emoji/combining text, deterministic terminal
  restoration and `--no-tui`; released OpenTUI 0.5.1 exposed no terminal-emulator/PTY renderable.
- Railway's public Rust CLI demonstrates the required product shape: a persistent management tree,
  a PTY-fed terminal emulator in the Agent pane, explicit focus release and optional same-session
  native full-screen reattach.
- OpenTUI main has since merged an internal Ghostty VT runtime. Its public embedded-terminal
  renderable remains unreleased, so it is eligible for a disposable spike but not a production
  dependency.
- Bun exposes local PTY/ConPTY through `Bun.Terminal`; existing Appaloft `TerminalSession` owns the
  transport-neutral remote byte stream, write, resize, detach and close boundary.

## Owner-Confirmed Decisions

The owner confirmed the following direction across the Railway-replacement discovery on
2026-08-10:

| Topic | Decision |
| --- | --- |
| Product boundary | Build the Workspace/remote-machine experience in public Appaloft; hosted Cloud injects authz, placement, credential custody and gateways. |
| Agent boundary | Appaloft owns the outer TUI; Pi, OpenCode, Claude Code, Codex and future adapters retain their native conversation/session UI. |
| First management entry | Use no-subcommand `appaloft workspace`; keep `appaloft code` as the fast repository activation path. |
| State truth | Render existing public Workspace, Server, Profile, Terminal, Preview and Task operations; add no TUI-only lifecycle or persistence. |
| Agent presentation | Embedded native Agent terminal is the default Workspace mode on accepted targets; full-screen is an explicit same-session focus mode, not a fallback implementation. |
| Focus | Bare Agent keys stay child-owned. One documented outer chord releases focus to Workspace navigation; mode switching never restarts the Agent. |
| Framework | Prefer OpenTUI + Bun PTY/TerminalSession if its public embedded API and real acceptance matrix pass; keep a Rust/Ratatui presentation replacement behind the same boundary. |
| Compatibility | Every mutation retains a headless/machine-readable equivalent; non-TTY and `--no-tui` never initialize the renderer. |

## Recommended First Slice

```text
appaloft workspace
  -> existing target/auth resolution
  -> bounded existing Workspace list/read models
  -> select Workspace
  -> show Profile/Server/status/Preview/Task summary
  -> attach existing managed TerminalSession or local native-client PTY
  -> render the Agent's native screen in the embedded pane
  -> release focus to the Workspace tree without detaching the Agent
  -> optionally maximize the same Session/PTY to native full-screen
  -> return to the embedded pane and refresh exact Workspace state
```

## Rejected Alternatives

- Parsing Agent terminal output into Appaloft messages, tools or hidden reasoning.
- Full-screen handoff-only as the finished Workspace experience.
- Rebuilding Agent messages, tools or approvals as Appaloft-native conversation state.
- Binding the Workspace domain to OpenTUI, Ratatui, Ghostty, xterm or another renderer.
- Replacing `appaloft code`, `workspace list/show/open/attach` or structured output.
- A TUI-owned Workspace cache, local Profile preference or lifecycle state machine.
- Branching on Agent names instead of Adapter attach capabilities.
- Adding Server enrollment, `--keep-awake`, exit-triggered removal, `dev` or `ca` to the first
  Workspace-control slice.

## Open Questions Resolved By Spec

- The first slice is browse/select/inspect/native-attach/return; creation continues through
  `appaloft code` or `workspace open`.
- The embedded Agent pane is core behavior; native full-screen is a same-session focus mode.
- OpenTUI is a replaceable presentation candidate, not a public contract or an accepted dependency.
- The revised disposable spike may use an unreleased upstream API only to answer feasibility. Code
  Round requires a released API and the full Agent, terminal and release matrix.
