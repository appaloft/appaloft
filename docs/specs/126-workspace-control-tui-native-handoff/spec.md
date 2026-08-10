# Workspace Control TUI With Native Agent Handoff

## Status

- Round: Spec review ready
- Artifact state: owner direction confirmed; spike complete; Ticket and Code not yet authorized
- Code changes allowed: no, until this Spec is accepted and an actor-visible ticket is ready
- Compatibility: additive presentation over existing public operations

## Business Outcome

An authenticated developer can run `appaloft workspace` in an interactive terminal, inspect
bounded Workspace state, select a Workspace and enter its Adapter-owned native Agent interface.
Returning from the Agent refreshes the same Workspace in the Appaloft control shell without
duplicating lifecycle, conversation or credential truth.

## Ubiquitous Language

| Term | Meaning |
| --- | --- |
| Workspace Control TUI | Appaloft-owned presentation over existing public operations and read models. |
| Control Shell | The outer Workspace list/detail/navigation renderer. |
| Native Agent Handoff | Exclusive full-screen terminal/client ownership transferred to the Adapter-declared attach transport. |
| Return Refresh | Bounded re-read of exact Workspace state after the native Agent interface returns. |
| Embedded Agent Pane | Terminal-emulated split-pane rendering of an Agent alternate screen; explicitly deferred. |

## Requirements And Acceptance Criteria

| ID | Behavior | Given | When | Then |
| --- | --- | --- | --- | --- |
| WS-TUI-ENTRY-001 | Interactive management entry | stdin/stdout are interactive and no Workspace subcommand is supplied | `appaloft workspace` runs | The control shell starts without changing any Workspace. |
| WS-TUI-QUERY-002 | Existing state truth | Workspaces exist on the resolved control-plane target | the shell loads or refreshes | It uses bounded existing public queries/descriptors and creates no TUI projection, cache or table. |
| WS-TUI-DETAIL-003 | Actionable detail | A Workspace is selected | detail is rendered | Exact Workspace/Profile/Server, Runtime/Terminal, Preview and Task summary fields are rendered only when supplied by existing public contracts. |
| WS-TUI-HANDOFF-004 | Native Agent ownership | The selected Runtime declares managed-terminal or native attach | attach is chosen | The control renderer releases terminal ownership before the existing attach path receives exclusive input/output; Appaloft does not parse Agent screen text. |
| WS-TUI-RETURN-005 | Restore and refresh | The native interface exits or disconnects | control returns | Terminal mode is restored and the exact Workspace is refreshed through bounded public reads without creating/resuming another Workspace. |
| WS-TUI-RECONNECT-006 | Existing reconnect semantics | The same Workspace/Session remains healthy | attach is chosen again | Existing attach/replay semantics resume the exact identity; the TUI owns no replay cursor beyond the public Terminal contract. |
| WS-TUI-ERROR-007 | Structured recovery | query, renderer startup, handoff or return refresh fails | the failure is presented | Stable existing code/phase/evidence is preserved; terminal restoration runs; secrets, raw host data and Agent output remain excluded. |
| WS-TUI-FALLBACK-008 | Headless compatibility | no TTY exists, `--no-tui` is supplied, or machine output is requested | Workspace management runs | The renderer is not initialized and existing headless Workspace commands remain usable and unchanged. |
| WS-TUI-CAPABILITY-009 | Adapter neutrality | different Agent adapters expose different attach capabilities | actions are rendered | Availability and handoff derive from declared capabilities, never Agent-name checks or terminal scraping. |
| WS-TUI-PACKAGE-010 | Supported release artifacts | macOS/Linux release targets are built | the packaged CLI starts the shell | Matching OpenTUI native assets are embedded and host smokes prove startup/cleanup; a missing native library fails safely without damaging terminal state. |
| WS-TUI-TERMINAL-011 | Terminal correctness | supported terminals exercise resize, mouse, focus, paste, signals, CJK and wide text | the shell and handoff run | The control shell restores deterministically and the Agent receives unmodified native terminal semantics while it owns the terminal. |
| WS-TUI-DOCS-012 | Discoverable boundary | a user reads Workspace CLI help | help is resolved | Docs distinguish `workspace` control shell, `code` activation, headless subcommands, native Agent ownership and `--no-tui`. |

## Public Surfaces

- CLI: no-subcommand `appaloft workspace`; add presentation-only `--no-tui` behavior if not already
  covered by structured/headless selection.
- Existing CLI: `appaloft code`, `workspace open/list/show/connect/attach/terminate/...` remain.
- API/oRPC/SDK/MCP: no new operation; the shell consumes existing operations.
- Persistence/events/read models: none.
- Cloud: may inject existing authz, placement, custody and gateway ports only.

## Domain Ownership

- Workspace identity/lifecycle remains Sandbox-owned; `workspaceId === sandboxId`.
- Agent Runtime and attach capability remain SandboxAgentRuntime/Adapter-owned.
- Terminal Session owns PTY transport and bounded replay.
- Preview, Task, Server and Profile state stay with their existing public owners.
- The CLI adapter owns only navigation, focus, renderer lifecycle and result presentation.

## Non-Goals

- Embedded/split Agent terminal pane or terminal emulator.
- Universal Agent conversation/message/tool model.
- New Workspace, Server, Session, Profile, Preview or Task operations.
- Workspace creation wizard, Server enrollment, `dev`, `ca`, keep-awake or exit-triggered removal.
- Windows support in the first production slice.
- Cloud-only behavior or private lifecycle state.

## Compatibility And Migration

- Additive presentation; no existing command is deprecated.
- Non-interactive and structured callers keep current behavior.
- The frontend framework can be replaced without changing operations or attach contracts.
- If any supported release/terminal gate fails, Code stops before enabling the default entry and
  retains the headless surfaces.

## Open Questions

No question remains that changes the first-slice ownership or workflow. Visual design, keymap,
Server enrollment and embedded panes require later Specs.
