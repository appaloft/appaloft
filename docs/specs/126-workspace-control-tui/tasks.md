# Tasks: Workspace Control TUI With Embedded Native Agent

## Spec Round

- [x] Capture the first OpenTUI 0.5.1 throwaway spike and gate verdict in public issue #1024.
- [x] Record owner-confirmed native-Agent, embedded-pane and public/private boundary decisions.
- [x] Revise Spec 126, plan, tasks and stable Test Matrix ids for embedded-by-default dual mode.
- [x] Refine ADR-107 so embedded and same-session full-screen modes share one terminal contract.
- [x] Position the presentation in the Business Operation Map without adding an operation.
- [x] Capture revised OpenTUI PR-head build, upstream tests, local PTY/Unicode/focus/same-session
  smoke and framework-neutral `TerminalSession` bridge evidence on the throwaway branch.
- [x] Complete and close the revised throwaway OpenTUI/Bun spike against
  `WS-TUI-SPIKE-001..009`; select the Rust/Ratatui fallback after the released-API and teardown
  gates fail.
- [x] Accept the Spec/ADR refinement through public PR #1025 before Ticket or Code Round.

## Ticket

- [x] Create public tracking issue #1026 after Spec acceptance.
- [x] Keep one actor-visible implementation slice linked to every `WS-TUI-*` id and exact fallback.
- [x] Mark #1026 `ready-for-agent` only after release targets and presentation boundary are exact.

## Test First

- [x] Add failing entry/query/detail tests without renderer initialization in headless modes.
- [x] Add fake byte-stream and real PTY tests for embedded rendering, focus release and
  same-session full-screen.
- [x] Add structured error, authentication, early-exit and signal restoration tests with exact
  detach and secret-safe presentation assertions.
- [x] Add capability-neutrality tests with multiple Adapter descriptors.
- [x] Add packaged macOS embedded startup plus release-bundle help/headless safety tests.
- [x] Collect Linux embedded startup and all-artifact help/headless safety evidence in release CI.

## Implementation

- [x] Add the framework-neutral CLI presentation boundary.
- [x] Implement bounded list/detail refresh using existing operations.
- [x] Add managed `TerminalSession` and local `Bun.Terminal` viewport adapters.
- [x] Implement the selected Rust/Ratatui renderer with VT100 cell rendering behind the
  replaceable sidecar protocol.
- [x] Implement focus release and same-session full-screen/return with no screen-semantic parsing.
- [x] Preserve every current headless/structured Workspace surface.

## Docs And Verification

- [x] Update localized Workspace and CLI docs during Code/Docs Round.
- [x] Run focused CLI/PTY/package tests, docs registry, `lint:ci`, `typecheck`, `test`, `build`
  and the local packaged macOS PTY smoke.
- [x] Collect the six-target release workflow and Linux artifact smoke evidence.
- [x] Run the opt-in provider-free native PTY matrix against installed Pi, OpenCode, Codex and
  Claude Code clients.
- [x] Add a repeatable host-terminal smoke that records alternate-screen, mouse, bracketed-paste,
  restoration, Workspace rendering and focus-release evidence without Agent/provider calls.
- [x] Verify the host-terminal smoke in macOS Terminal.app and the Codex xterm-compatible PTY.
- [x] Verify the same smoke in a real VS Code 1.132.0 integrated terminal with isolated user data
  and no installed extension or user-setting mutation.
- [x] Complete the supported host-terminal matrix in Terminal.app, iTerm2, Ghostty, VS Code
  Terminal and a representative Linux terminal. iTerm2 passed from a signed app copied only into
  `/private/tmp/Applications`; the temporary process and app copy were removed, and the real
  `/Applications` directory was never modified.
- [x] Sync ADR, Spec, tasks, Test Matrix, operation map, help, docs and release evidence.
