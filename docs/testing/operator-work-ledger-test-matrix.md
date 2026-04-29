# Operator Work Ledger Test Matrix

## Normative Contract

Tests for operator work ledger visibility must prove that operators can list and show safe
background work state without exposing recovery mutations or secret-bearing detail.

## Global References

- [Operator Work Ledger Spec](../specs/010-operator-work-ledger/spec.md)
- [operator-work.list](../queries/operator-work.list.md)
- [operator-work.show](../queries/operator-work.show.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [Error Model](../errors/model.md)
- [ADR-016](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-028](../decisions/ADR-028-command-coordination-scope-and-mutation-admission.md)
- [ADR-029](../decisions/ADR-029-deployment-event-stream-and-recovery-boundary.md)

## Matrix

| Test ID | Layer | Case | Expected result |
| --- | --- | --- | --- |
| OP-WORK-CATALOG-001 | catalog | `operator-work.list` and `operator-work.show` are active queries | Catalog entries expose CLI and HTTP/oRPC transports and schemas. |
| OP-WORK-QRY-001 | application | Deployment attempt aggregation | Deployment read-model rows become `kind = deployment` work items with deployment ids and read-only next actions. |
| OP-WORK-QRY-002 | application | Proxy bootstrap aggregation | Server edge proxy read-model state becomes `kind = proxy-bootstrap` work items without user workload mutation. |
| OP-WORK-QRY-003 | application | Certificate attempt aggregation | Latest certificate attempts become `kind = certificate` work items with safe related ids. |
| OP-WORK-QRY-004 | application | Filters | `kind`, `status`, `resourceId`, `serverId`, `deploymentId`, and `limit` filter the aggregate list. |
| OP-WORK-QRY-005 | application | Show one item | `operator-work.show` returns the matching item or `not_found`. |
| OP-WORK-REDAC-001 | application | No secret leakage | Work items do not include raw log messages, environment values, private keys, certificate material, or provider command lines. |
| OP-WORK-ENTRY-001 | CLI | `appaloft work list` dispatches query | CLI dispatches `ListOperatorWorkQuery`. |
| OP-WORK-ENTRY-002 | CLI | `appaloft work show <workId>` dispatches query | CLI dispatches `ShowOperatorWorkQuery`. |
| OP-WORK-ENTRY-003 | HTTP/oRPC | HTTP list/show dispatch | HTTP routes dispatch the shared query schemas. |
| OP-WORK-DOCS-001 | docs | Public docs registry coverage | Both operation keys map to the operator work ledger help topic. |

## Current Implementation Notes

This matrix begins with deployment, proxy-bootstrap, and certificate aggregation. Remote-state,
source-link, route-realization, runtime-maintenance, and worker/job status rows remain future
extensions once their persisted read models exist.
