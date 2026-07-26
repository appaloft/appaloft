# Portable Workspace Recovery And Placement Reconciliation Tasks

## Sync And Spec

- [x] Accept ADR-098.
- [x] Define stable requirements and non-claims.
- [x] Add portable recovery and relocation test matrix rows.

## Public Implementation

- [x] Add provider relocation observation and maintenance migration reporting.
- [x] Implement shared-filesystem Docker recovery packages.
- [x] Verify recovery family and integrity before target restore.
- [x] Retain source recovery on failed cutover.
- [x] Remove exact recovery packages after restore or termination.

## Composition Readiness

- [x] Configure an explicit shared recovery root and store id.
- [x] Keep inactive placement observation boolean and topology-free.
- [x] Relocate eligible Sandboxes through existing pause/resume operations.
- [x] Document provider-specific external mount responsibility.

## Verification

- [x] Pass targeted public tests.
- [x] Pass real two-provider Docker recovery smoke.
- [x] Pass public repository gates.
