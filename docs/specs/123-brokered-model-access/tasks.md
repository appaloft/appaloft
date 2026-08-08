# Tasks: Brokered Model Access

## Source of truth and ticket

- [x] Record owner-confirmed discovery, spec, ADR and test matrix.
- [ ] Create one actor-visible public issue and label it `ready-for-agent`.

## Test first

- [ ] Add `MODEL-ACCESS-BIND-001..003` Runtime/Harness contract tests.
- [ ] Add `MODEL-ACCESS-CAP-004/REVOKE-005` Pi/OpenCode broker tests.
- [ ] Keep `MODEL-ACCESS-SURFACE-006/COMPAT-007` parity and custom harness tests green.

## Implementation

- [ ] Add a shared brokered model access contract.
- [ ] Propagate resolved Runtime credential bindings into Harness execution.
- [ ] Bind Pi/OpenCode issuance to exactly one `model-api` reference.
- [ ] Keep provider secret values outside all public inputs, results and child process material.

## Verification and sync

- [ ] Run focused tests, lint, typecheck, full public test and build.
- [ ] Update operation/domain/roadmap docs and matrix evidence.
- [ ] Reconcile issue, tasks and implementation before public merge.
