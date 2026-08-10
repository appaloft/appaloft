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
5. A future no-subcommand `appaloft workspace` experience may present Appaloft-owned Workspace,
   Server, Profile, Terminal, Task, Preview, Deployment and recovery state. Every mutation must
   dispatch an existing public operation and retain a headless or machine-readable equivalent.
6. Agent conversation and session semantics remain owned by Pi, OpenCode, Claude Code, Codex and
   other Agent adapters. Appaloft may embed or hand off their native PTY, but must not scrape
   terminal text into a vendor-neutral conversation model or interpret hidden reasoning.
7. Terminal framework choice is not part of the product contract. A disposable hardest-path spike
   must prove release packaging, nested PTY behavior, reconnect and supported terminal behavior
   before a production control TUI Code Round. Failure selects a different presentation frontend
   without changing public operations or PTY contracts.
8. `--keep-awake` and exit-triggered removal are not part of the first activation slice. They need
   separate lifecycle acceptance for policy ownership, partial failure, native handoff and cleanup
   evidence before becoming public options.

## Consequences

- A developer can use a memorable task command without learning internal Workspace ids.
- API, SDK, Console, remote CLI and future tool surfaces continue to converge on
  `workspaces.open`; only CLI presentation is added.
- Existing automation remains compatible because `workspace open` and all headless commands stay
  available.
- The future control TUI cannot become a second application layer or a replacement Agent chat UI.
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

- `appaloft code` is specified but not implemented in this Spec Round.
- The Workspace control TUI remains a later behavior gated by the spike in Spec 125 research.
- `--keep-awake` and exit-triggered removal require a separate Spec/Test Matrix update.

## Verification

See the
[Workspace Code Activation Test Matrix](../testing/workspace-code-activation-test-matrix.md).
