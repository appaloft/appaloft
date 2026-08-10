# Tasks: Workspace Control TUI With Native Agent Handoff

## Spec Round

- [x] Capture the throwaway OpenTUI spike and gate verdict in public issue #1024.
- [x] Record owner-confirmed native-Agent and public/private boundary decisions.
- [x] Add Spec 126, plan, tasks and stable Test Matrix ids.
- [x] Refine ADR-107 so full-screen native handoff and embedded terminal emulation have distinct
  gates.
- [x] Position the presentation in the Business Operation Map without adding an operation.
- [ ] Accept the Spec/ADR refinement before Ticket or Code Round.

## Ticket

- [ ] Create one public tracking issue after Spec acceptance.
- [ ] Split only actor-visible vertical slices; link every `WS-TUI-*` id and exact fallback.
- [ ] Mark `ready-for-agent` only after release targets and presentation boundary are exact.

## Test First

- [ ] Add failing entry/query/detail tests without renderer initialization in headless modes.
- [ ] Add fake native handoff tests for renderer release, exclusive PTY ownership and return refresh.
- [ ] Add structured error and terminal restoration tests for startup/handoff/refresh failures.
- [ ] Add capability-neutrality tests with multiple Adapter descriptors.
- [ ] Add packaged macOS/Linux startup, cleanup and missing-native-library fallback tests.

## Implementation

- [ ] Add the framework-neutral CLI presentation boundary.
- [ ] Implement bounded list/detail refresh using existing operations.
- [ ] Implement OpenTUI control shell only after package gates pass.
- [ ] Reuse existing native attach transport with no screen parsing or TUI lifecycle state.
- [ ] Preserve every current headless/structured Workspace surface.

## Docs And Verification

- [ ] Update localized Workspace and CLI docs during Code/Docs Round.
- [ ] Run focused CLI/PTY/package tests, docs registry, `lint:ci`, `typecheck`, `test`, `build` and
  release artifact smokes.
- [ ] Complete the opt-in supported terminal matrix.
- [ ] Sync ADR, Spec, tasks, Test Matrix, operation map, help, docs and release evidence.
