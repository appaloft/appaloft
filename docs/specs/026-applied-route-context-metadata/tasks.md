# Tasks: Applied Route Context Metadata Contract Baseline

## Spec Round

- [x] Confirm PR #159 is merged and `main` contains the merge commit.
- [x] Confirm Docs Preview failure is external `remote-state-resolution` infrastructure.
- [x] Create fresh `fix/` branch from latest `main`.
- [x] Locate behavior in the operation map as existing resource access failure diagnostics and
  route intent/status diagnostics, not a new public operation.
- [x] Record no-ADR-needed decision.
- [x] Add this feature artifact.
- [x] Update test matrices, domain model, core operations, and roadmap notes.

## Test-First

- [x] Add `RES-ACCESS-DIAG-APPLIED-001..005` automated tests before production code.

## Implementation

- [x] Add provider-neutral applied route context metadata types and contracts.
- [x] Attach metadata to provider-rendered proxy preview routes/diagnostics.
- [x] Prefer supplied applied metadata during evidence capture, then fallback to hostname/path lookup.
- [x] Preserve redaction and avoid provider raw payload leakage.

## Verification

- [x] Run targeted application/provider/contracts/HTTP tests.
- [x] Run `bun run typecheck`.
- [x] Run `bun run lint`.

## Post-Implementation Sync

- [x] Reconcile docs, test matrices, roadmap, and tasks with passing test bindings.
- [ ] Commit, push, open PR, and report CI/Docs Preview status.
