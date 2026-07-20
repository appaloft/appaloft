# Control-Plane Portability

## Status

- Round: Spec + Test-First
- Artifact state: ready for Code Round
- Compatibility impact: additive minor surface
- Decision: [ADR-092](../../decisions/ADR-092-control-plane-portability.md)

## Business Outcome

An owner can export a complete encrypted control-plane artifact, dry-run its import into another
compatible instance, merge or replace state, recover from failure, and delete artifacts explicitly.

## Acceptance Criteria

| ID | Scenario | Then |
| --- | --- | --- |
| PORTABILITY-PLAN-001 | Export plan | Returns table/count/compatibility and external-reference warnings without row values or secrets. |
| PORTABILITY-EXPORT-002 | Export | Writes authenticated encrypted v1 artifact with checksum; passphrase and plaintext never persist. |
| PORTABILITY-IMPORT-PLAN-003 | Import dry-run | Verifies checksum/decryption/schema compatibility and reports conflicts for merge/replace without mutation. |
| PORTABILITY-IMPORT-004 | Merge import | Transactionally adds/updates compatible rows and preserves unrelated target rows. |
| PORTABILITY-REPLACE-005 | Replace import | Requires acknowledgement, write lock, rollback artifact, transactional replacement, and safe readback. |
| PORTABILITY-ROLLBACK-006 | Import fails | Database changes roll back and rollback artifact remains available. |
| PORTABILITY-CLEANUP-007 | Delete artifact | Exact artifact is checksum/owner scoped and provider deletion precedes readback deletion. |
| PORTABILITY-SURFACE-008 | Product surfaces | API/CLI/Web use shared schemas; CLI passphrase supports stdin. |

## Non-Goals

- No claim that provider-owned external resources are copied.
- No plaintext download endpoint or passphrase persistence.
