# Discovery: Workspace Control TUI With Native Agent Handoff

## Business Outcome

A developer can run `appaloft workspace` to inspect and select existing Agent Workspaces from one
Appaloft-owned terminal control surface, enter the selected Agent's native interface, then return
to refreshed Workspace state without learning internal ids or adopting a second conversation UI.

## Existing Evidence

- ADR-094/103 and Specs 111/120 own Workspace identity, create-or-resume, Profile selection,
  Terminal Session and capability-driven attach.
- ADR-107 and Spec 125 reserve a no-subcommand `appaloft workspace` presentation while keeping
  `appaloft code` and headless Workspace commands canonical and scriptable.
- Public issue [#1024](https://github.com/appaloft/appaloft/issues/1024) captured the OpenTUI 0.5.1
  hardest-path spike on throwaway commit `26713855`.
- The spike passed a host Bun-compiled shell, CJK/emoji/combining text, deterministic terminal
  restoration and `--no-tui`, but OpenTUI exposes no terminal-emulator/PTY renderable for nesting
  an arbitrary Agent alternate screen.

## Owner-Confirmed Decisions

The owner confirmed the following direction across the Railway-replacement discovery on
2026-08-10:

| Topic | Decision |
| --- | --- |
| Product boundary | Build the Workspace/remote-machine experience in public Appaloft; hosted Cloud injects authz, placement, credential custody and gateways. |
| Agent boundary | Appaloft owns the outer TUI; Pi, OpenCode, Claude Code, Codex and future adapters retain their native conversation/session UI. |
| First management entry | Use no-subcommand `appaloft workspace`; keep `appaloft code` as the fast repository activation path. |
| State truth | Render existing public Workspace, Server, Profile, Terminal, Preview and Task operations; add no TUI-only lifecycle or persistence. |
| Handoff | First production slice uses full-screen native PTY/client handoff and refresh-on-return, not split-pane terminal emulation. |
| Framework | Prefer OpenTUI imperative for the control shell if the real macOS/Linux release matrix passes; keep the presentation replaceable. |
| Compatibility | Every mutation retains a headless/machine-readable equivalent; non-TTY and `--no-tui` never initialize the renderer. |

## Recommended First Slice

```text
appaloft workspace
  -> existing target/auth resolution
  -> bounded existing Workspace list/read models
  -> select Workspace
  -> show Profile/Server/status/Preview/Task summary
  -> use existing attach handoff capability
  -> destroy/suspend control renderer
  -> Agent-owned full-screen PTY/client
  -> return and refresh exact Workspace state
```

## Rejected Alternatives

- Parsing Agent terminal output into Appaloft messages, tools or hidden reasoning.
- Building an xterm-compatible emulator merely to ship a first split-pane.
- Replacing `appaloft code`, `workspace list/show/open/attach` or structured output.
- A TUI-owned Workspace cache, local Profile preference or lifecycle state machine.
- Branching on Agent names instead of Adapter attach capabilities.
- Adding Server enrollment, `--keep-awake`, exit-triggered removal, `dev` or `ca` to the first
  Workspace-control slice.

## Open Questions Resolved By Spec

- The first slice is browse/select/inspect/native-attach/return; creation continues through
  `appaloft code` or `workspace open`.
- A true embedded/split Agent pane remains a later terminal-emulation decision.
- OpenTUI is a replaceable presentation dependency, not a public contract.
- The full terminal and release matrix is a Code gate, not evidence supplied by the single-host
  research spike.
