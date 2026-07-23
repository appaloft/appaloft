# Tasks: Agent Workspace Entry Workflow

## Test-First

- [x] `AGENT-OPENCODE-011`: add OpenCode adapter contract tests.
- [x] `AGENT-WS-CLI-012`: add public Workspace CLI composition tests.
- [x] `AGENT-WS-SDK-013`: add public Workspace SDK composition tests.

## Source Of Truth

- [x] Add ADR-094 and Spec 111.
- [x] Synchronize domain model, roadmap, operation map, workflow and public docs.

## Implementation

- [x] Add harness prepare/terminate lifecycle hooks and failed-start state.
- [x] Implement public OpenCode Sandbox Agent Harness.
- [x] Implement Public Workspace CLI composition.
- [x] Implement Public Workspace SDK handles.
- [x] Remove the duplicate private Cloud Workspace model and persistence.

## Entrypoints And Docs

- [x] Add `appaloft workspace` help and public task documentation.
- [x] Keep canonical API/oRPC operations unchanged and document the composition.
- [x] Register Pi/OpenCode public adapters from Cloud as hosted configuration only.

## Verification

- [x] Run focused core/application/runtime/CLI/SDK tests.
- [x] Run public lint, typecheck, tests, build and `check:ash`.
- [x] Run affected Cloud tests, lint, typecheck and tests.

## Post-Implementation Sync

- [x] Reconcile Spec 111, ADR-094, operation docs, tests, implementation and migration gaps.
