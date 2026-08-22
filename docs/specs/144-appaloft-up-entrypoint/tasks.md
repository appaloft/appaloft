# Tasks — Appaloft Up Entrypoint

- [x] Record the owner-confirmed Railway-like `up` direction in discovery.
- [x] Complete Spec, plan, tasks, and `UP-ENTRY-*` Test Matrix.
- [x] Create public tracking issue #1370 and mark implementation slice #1371
  `ready-for-agent` with the governing artifacts.
- [x] Add red shell/CLI tests for `up`, deploy parity, guards, JSON, terminal
  proof, and help (`UP-ENTRY-001` through `UP-ENTRY-007`).
- [x] Register `up` and `deploy` as names for one deploy option schema and one
  in-process workflow.
- [x] Make root help and command help lead with `up` and document the 1.x
  `deploy` compatibility spelling.
- [x] Synchronize the business operation map wording without adding a duplicate
  operation.
- [x] Update first-deployment public docs in all supported locales, stable help
  anchors, docs registry, and AI-facing Appaloft skill guidance.
- [x] Run focused tests, existing deploy/onboarding/login regression tests,
  docs-registry tests, `lint:ci`, and `typecheck`.
- [x] Run authorized source-CLI smoke and record target, external effects,
  cleanup, and terminal evidence.
- [x] Synchronize issue status, task evidence, Spec, Test Matrix, documentation,
  and migration notes before merge.

## Verification Evidence

- Source CLI help and non-interactive guard smoke passed without composing a
  local runtime.
- The authorized Hostinger workspace smoke reused the existing Project and
  repository binding and left the remote occupancy inventory unchanged. It
  then stopped at a hosted integration boundary before a new Workspace was
  persisted; that separate hosted repair is outside this public Spec.
- Focused `UP-ENTRY-*`, help validation, onboarding, deployment JSON, and
  structured-error suites passed. Public lint, typecheck, build, and final
  repository checks are recorded in the delivery PR.
