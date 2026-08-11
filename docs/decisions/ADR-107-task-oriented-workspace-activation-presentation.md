# ADR-107: Task-Oriented Workspace Activation Presentation

Status: Accepted

Date: 2026-08-10

## Context

ADR-094 defines Agent Workspace as a public workflow over Sandbox, Agent Runtime and Terminal
Session. ADR-103 adds atomic Profile-aware `workspaces.open` coordination and the existing
`appaloft workspace open` entrypoint. The underlying workflow is complete, but the primary user
task is still expressed through a resource-oriented command tree.

Appaloft needs one short command that means “enter the Agent Workspace for this repository” while
preserving scriptable Workspace operations and each Agent's native interface. A future Workspace
control TUI also needs a durable ownership boundary before a terminal framework is selected.

## Decision

1. `appaloft code [path]` is the canonical task-oriented CLI entry for opening or resuming the
   Agent Workspace associated with a local Git repository. The default path is `.`.
2. `appaloft code` is CLI presentation over the existing `workspaces.open` operation. It reuses the
   same local Git preflight, control-plane target resolution, Agent Workspace Profile resolution,
   input schema, errors, result and attach handoff. It does not add an operation-catalog entry,
   command/query message, Workspace aggregate, projection or lifecycle.
3. The first activation slice accepts `--profile`, `--new` and `--no-attach` with exactly the
   semantics already governed for `appaloft workspace open`. Global control-plane selection keeps
   using `--control-plane-profile` and the existing target resolver.
4. `appaloft workspace open` and all current headless Workspace subcommands remain supported.
   `appaloft code` is additive and does not deprecate them.
5. A no-subcommand `appaloft workspace` experience presents Appaloft-owned Workspace, Server,
   Profile, Terminal, Task, Preview, Deployment and recovery state beside an embedded native Agent
   terminal. Every mutation must dispatch an existing public operation and retain a headless or
   machine-readable equivalent.
6. Agent conversation and session semantics remain owned by Pi, OpenCode, Claude Code, Codex and
   other Agent adapters. Appaloft terminal-emulates and renders their native PTY byte stream but
   must not scrape terminal text into a vendor-neutral conversation model, infer tool calls or
   interpret hidden reasoning.
7. The Workspace control experience is dual mode. Embedded mode keeps Appaloft navigation visible
   while the Agent owns focus inside its pane. Focus mode maximizes the same live Terminal Session
   or local PTY without starting another Agent process, then returns to the outer presentation.
   Full-screen handoff is an explicit same-session mode, not a substitute for the embedded pane.
8. Terminal framework choice is not part of the product contract. A disposable hardest-path spike
   must prove terminal emulation, nested native Agent behavior, input/focus ownership, reconnect,
   same-session mode switching, Unicode, supported release packaging and terminal-matrix behavior.
   Failure selects a different presentation frontend without changing public operations or PTY
   contracts.
9. `--keep-awake` and exit-triggered removal are not part of the first activation slice. They need
   separate lifecycle acceptance for policy ownership, partial failure, native handoff and cleanup
   evidence before becoming public options.

## Consequences

- A developer can use a memorable task command without learning internal Workspace ids.
- API, SDK, Console, remote CLI and future tool surfaces continue to converge on
  `workspaces.open`; only CLI presentation is added.
- Existing automation remains compatible because `workspace open` and all headless commands stay
  available.
- The control TUI cannot become a second application layer or a replacement Agent chat UI.
- Embedded and full-screen modes share one live Session identity and one Agent process.
- OpenTUI, Ratatui or another frontend can be replaced without changing Workspace domain truth.

## Rejected Alternatives

- A new `code.open` operation or Workspace lifecycle.
- Implementing `appaloft code` as client-side list/create/attach races.
- Making a TUI-only mutation path.
- Reconstructing Agent conversations from terminal output.
- Adding `--rm` before exact cleanup and handoff ownership are specified.
- Storing another local Agent Profile preference instead of using explicit or Project-default
  Workspace Profile resolution.

## Migration Gaps

- `appaloft code` is implemented under Spec 125. The no-subcommand Workspace control presentation
  is in Code Round under accepted Spec 126 and public Ticket #1026.
- Closed Spike #1024 selected a replaceable Rust/Ratatui sidecar because the required OpenTUI
  embedded API remained unreleased and its teardown failed the bounded-process gate. This is an
  implementation choice behind the framework-neutral presentation and terminal contracts, not a
  new domain ownership decision.
- The Appaloft release artifact, Linux CI and opt-in supported terminal/Agent matrix remain Spec 126
  completion gates.
- Preview, Agent Task delivery, Promotion and Deployment Proof actions are implemented under
  accepted Spec 128 and dispatch only their existing public operations. The Bun parent validates
  targets against the latest selected detail and reads authoritative Deployment Proof; the Ratatui
  renderer owns only bounded forms and confirmation state.
- Recovery and cleanup evidence is implemented under accepted Spec 130. The Bun parent maps
  existing Sandbox/Snapshot/Runtime/Port truth and dispatches existing Snapshot commands; the
  Ratatui renderer owns only the bounded Recovery palette, fixed retention form and confirmation
  state. `Workspace-owned cleanup` never claims provider-wide zero residue.
- `--keep-awake` and exit-triggered removal require a separate Spec/Test Matrix update.

## Verification

See the
[Workspace Code Activation Test Matrix](../testing/workspace-code-activation-test-matrix.md) and
[Workspace Control TUI Test Matrix](../testing/workspace-control-tui-test-matrix.md). Delivery
controls are verified by the
[Workspace Control Delivery Actions Test Matrix](../testing/workspace-control-delivery-actions-test-matrix.md).
Recovery controls and their bounded cleanup evidence are verified by the
[Workspace Control Recovery And Cleanup Evidence Test Matrix](../testing/workspace-control-recovery-evidence-test-matrix.md).
