# Tasks: Workspace Control TUI With Embedded Native Agent

## Spec Round

- [x] Capture the first OpenTUI 0.5.1 throwaway spike and gate verdict in public issue #1024.
- [x] Record owner-confirmed native-Agent, embedded-pane and public/private boundary decisions.
- [x] Revise Spec 126, plan, tasks and stable Test Matrix ids for embedded-by-default dual mode.
- [x] Refine ADR-107 so embedded and same-session full-screen modes share one terminal contract.
- [x] Position the presentation in the Business Operation Map without adding an operation.
- [x] Capture revised OpenTUI PR-head build, upstream tests, local PTY/Unicode/focus/same-session
  smoke and framework-neutral `TerminalSession` bridge evidence on the throwaway branch.
- [ ] Complete the revised throwaway OpenTUI/Bun spike against `WS-TUI-SPIKE-001..009`.
- [ ] Accept the Spec/ADR refinement before Ticket or Code Round.

## Ticket

- [ ] Create one public tracking issue after Spec acceptance.
- [ ] Split only actor-visible vertical slices; link every `WS-TUI-*` id and exact fallback.
- [ ] Mark `ready-for-agent` only after release targets and presentation boundary are exact.

## Test First

- [ ] Add failing entry/query/detail tests without renderer initialization in headless modes.
- [ ] Add fake byte-stream tests for embedded rendering, focus release and same-session full-screen.
- [ ] Add structured error and terminal restoration tests for parser/attach/resize/refresh failures.
- [ ] Add capability-neutrality tests with multiple Adapter descriptors.
- [ ] Add packaged macOS/Linux embedded startup plus all-artifact help/headless safety tests.

## Implementation

- [ ] Add the framework-neutral CLI presentation boundary.
- [ ] Implement bounded list/detail refresh using existing operations.
- [ ] Add managed `TerminalSession` and local `Bun.Terminal` viewport adapters.
- [ ] Implement OpenTUI embedded terminal only after public API and package gates pass.
- [ ] Implement focus release and same-session full-screen/return with no screen-semantic parsing.
- [ ] Preserve every current headless/structured Workspace surface.

## Docs And Verification

- [ ] Update localized Workspace and CLI docs during Code/Docs Round.
- [ ] Run focused CLI/PTY/package tests, docs registry, `lint:ci`, `typecheck`, `test`, `build` and
  release artifact smokes.
- [ ] Complete the opt-in supported terminal and real-Agent matrix.
- [ ] Sync ADR, Spec, tasks, Test Matrix, operation map, help, docs and release evidence.
