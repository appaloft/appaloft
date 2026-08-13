# Platform Migration Journey Test Matrix

| ID | Level | Evidence target | Binding | Status |
| --- | --- | --- | --- | --- |
| MIG-BUNDLE-001 | unit/contract | strict deterministic secret-safe bundle parsing | planned bundle schema tests | planned |
| MIG-SOURCE-002 | adapter contract | Railway translation and unsupported blockers | planned Railway source adapter tests | planned |
| MIG-PLAN-003 | application | no-effect operation plan and digest | planned migration coordinator tests | planned |
| MIG-APPLY-004 | application/integration | ordered CommandBus dispatch, receipts and idempotency | planned coordinator tests | planned |
| MIG-READ-005 | integration | safe existing-query status/readback | planned coordinator tests | planned |
| MIG-FAIL-006 | integration | partial failure, resume and no later dependent effects | planned coordinator tests | planned |
| MIG-VERIFY-007 | integration | health/proof/config/domain/data evidence | planned verification tests | planned |
| MIG-CLEAN-008 | integration | reverse exact cleanup preserving reused state | planned cleanup tests | planned |
| MIG-SURFACE-009 | contract | CLI/JSON/HTTP/oRPC/SDK/Web parity | planned transport/Web tests | planned |
| MIG-WEB-010 | real e2e | fresh web migration/rollback/cleanup | planned local Docker + composed packet | planned |
| MIG-COMPOSE-011 | real e2e | multi-service migration/recovery/cleanup | planned local Docker + composed packet | planned |
| MIG-STATEFUL-012 | real e2e | dependency/volume/domain/TLS/backup/restore/exit | planned local Docker + composed packet | planned |
| MIG-AUTH-013 | integration | role/tenant/entitlement/secret safety | planned public and Cloud auth tests | planned |
| MIG-COMPAT-014 | contract | existing operation compatibility/no duplicate lifecycle | planned catalog/boundary tests | planned |

No R4 completion claim is permitted until `MIG-WEB-010`, `MIG-COMPOSE-011` and
`MIG-STATEFUL-012` have current real evidence with exact cleanup.
