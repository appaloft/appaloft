# Tasks: Brokered Model Access

## Source of truth and ticket

- [x] Record owner-confirmed discovery, spec, ADR and test matrix.
- [x] Create public [appaloft#1001](https://github.com/appaloft/appaloft/issues/1001) and label it `ready-for-agent`.
- [x] Create follow-up [appaloft#1003](https://github.com/appaloft/appaloft/issues/1003) for the narrow protocol export required by the Cloud boundary review.

## Test first

- [x] Add `MODEL-ACCESS-BIND-001..003` Runtime/Harness contract tests.
- [x] Add `MODEL-ACCESS-CAP-004` Pi/OpenCode broker tests; revoke provider behavior remains Cloud companion acceptance.
- [x] Keep `MODEL-ACCESS-SURFACE-006/COMPAT-007` parity and custom harness tests green.

## Implementation

- [x] Add a shared brokered model access contract.
- [x] Propagate resolved Runtime credential bindings into Harness execution.
- [x] Bind Pi/OpenCode issuance to exactly one `model-api` reference.
- [x] Keep provider secret values outside all public inputs, results and child process material.
- [x] Export `SandboxAgentModelProtocol` through a narrow application subpath so private compositions can reuse the public vocabulary without importing the application barrel.

## Verification and sync

- [x] Run focused tests, lint, typecheck, full public test and build.
- [x] Update operation/domain/roadmap docs and matrix evidence.
- [x] Reconcile issue, tasks and implementation before public merge.
