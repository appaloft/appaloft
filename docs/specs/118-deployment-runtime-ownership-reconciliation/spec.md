# Deployment Runtime Ownership Reconciliation

## Status

Accepted for Code Round.

## Goal

Converge server-backed deployment runtime to control-plane desired state without deleting current,
rollback-protected, shared, or unrelated provider assets.

## Scope

- correct replacement lineage for create, retry, redeploy, and rollback paths;
- exact ownership inventory and desired-versus-actual classification;
- successful replacement and failed-attempt compensating cleanup;
- exact cleanup readback, bounded retry, and idempotency;
- missing-Resource orphan handling in capacity protection;
- shared image, volume, network, route, and workspace fencing;
- product lifecycle reuse by Preview and Dev Seed cleanup.

## Out Of Scope

- provider-wide Docker prune operations;
- deleting data volumes without explicit lifecycle intent;
- changing rollback retention duration;
- hosted authorization, quota, billing, audit policy, or registered-Server composition.

## Requirements

| ID | Behavior | Given | When | Then |
| --- | --- | --- | --- | --- |
| DEP-RUNTIME-001 | Runtime-owner lineage | A succeeded attempt owns runtime and a later attempt failed | A retry is admitted | The retry supersedes the succeeded runtime owner while the latest attempt remains the concurrency gate. |
| DEP-RUNTIME-002 | Successful replacement | A candidate is verified and its route is current | Superseded cleanup runs | Only containers labelled with the same Resource id and superseded Deployment id are removed and exact readback reports none remaining. |
| DEP-RUNTIME-003 | Failed compensation | A new attempt starts provider effects but fails before success | Compensation runs | Only the failed attempt's exact runtime is removed; the previous runtime owner and route remain. |
| DEP-RUNTIME-004 | Cleanup retry | Exact cleanup or readback fails retryably | Lifecycle processing continues | A bounded retry is recorded and later re-executes the same idempotent cleanup target. |
| DEP-RUNTIME-005 | Current route fence | Provider inventory includes the current route target | Reconciliation classifies candidates | The current Deployment is protected even when older or when another attempt failed later. |
| DEP-RUNTIME-006 | Missing Resource orphan | A fully labelled runtime refers to a Resource absent from control-plane desired state | Exact prune or reconciliation runs | The runtime is classified orphan and is not protected as active solely because its Deployment succeeded. |
| DEP-RUNTIME-007 | Rollback fence | A Deployment or asset is an explicit rollback candidate | Cleanup runs | Its runtime and recovery assets remain protected until retention releases them. |
| DEP-RUNTIME-008 | Shared asset fence | An image, volume, network, or workspace is shared or ownership is incomplete | Cleanup runs | The asset is preserved and the result reports the blocking reason. |
| DEP-RUNTIME-009 | Product cleanup consumers | Preview or Dev Seed lifecycle removes a Resource | Cleanup completes | Product operations remove exact owned runtime and readback proves no owned container, network, image, volume, or workspace remains. |
| DEP-RUNTIME-010 | Idempotency | The exact runtime is already absent | Cleanup or retry repeats | The operation succeeds without affecting any other Deployment or provider asset. |

## Acceptance

- regression tests cover every requirement id;
- provider tests use labels and ids, never names alone, as ownership proof;
- destructive operations expose dry-run candidates and exact readback;
- public lint, typecheck, test, and build pass;
- a real registered Server readback proves current routes and workloads are unchanged after cleanup.
