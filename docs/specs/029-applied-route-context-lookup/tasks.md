# Tasks: Applied Route Context Lookup Baseline

## Spec Round

- [x] Confirm PR #162 is merged into latest `main`.
- [x] Create `fix/applied-route-context-lookup-baseline` from latest `main`.
- [x] Locate the behavior in `docs/BUSINESS_OPERATION_MAP.md` as existing resource access failure
  diagnostics and route intent/status diagnostics, not a new public operation.
- [x] Record no-ADR-needed because the slice reuses existing read/query contracts and does not
  change operation boundaries, route ownership, durable state, or recovery semantics.
- [x] Add this feature artifact directory with `spec.md`, `plan.md`, and `tasks.md`.

## Test-First

- [x] `RES-ACCESS-DIAG-APPLIED-006`: add application coverage for lookup by diagnostic id from
  reconstructed safe `applied-route-context/v1` metadata.
- [x] `RES-ACCESS-DIAG-APPLIED-007`: add application coverage for lookup by route id, resource id,
  and deployment id where available.
- [x] `RES-ACCESS-DIAG-APPLIED-008`: add HTTP renderer/evidence coverage proving applied metadata
  uses shared lookup before hostname/path fallback.
- [x] `RES-ACCESS-DIAG-APPLIED-009`: add source-preservation coverage for generated default,
  durable domain, server-applied, and deployment-snapshot contexts.
- [x] `RES-ACCESS-DIAG-APPLIED-010`: add redaction/read-only coverage for lookup output.
- [x] `ROUTE-TLS-READMODEL-017`: add routing/domain matrix coverage that applied lookup does not
  create managed route/domain/certificate/recovery state.

## Implementation

- [x] Extend the internal route context lookup service to accept safe applied lookup identifiers.
- [x] Return diagnostic id, proxy kind, provider key, route status, and applied/observed timestamps
  when available.
- [x] Route evidence capture with supplied applied metadata through the shared lookup core before
  hostname/path fallback.
- [x] Preserve generated default, durable domain, server-applied, and deployment-snapshot source
  values.

## Entrypoints And Docs

- [x] Keep API/oRPC, CLI, Web, public docs, and operation catalog unchanged.
- [x] Update domain model, core operations notes, workflow/error notes, test matrices, and roadmap
  Phase 6 verification notes.

## Verification

- [x] Run targeted application route context lookup tests.
- [x] Run targeted HTTP renderer/evidence tests.
- [x] Run `bun install --frozen-lockfile`.
- [x] Run `bun run typecheck`.
- [x] Run `bun run lint`.

## Post-Implementation Sync

- [x] Reconcile this spec, plan, tasks, source-of-truth docs, tests, and code.
- [ ] Commit, push, open PR, and report CI/Docs Preview status.
