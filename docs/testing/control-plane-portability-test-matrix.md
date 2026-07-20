# Control-Plane Portability Test Matrix

| ID | Automation | Binding | Status |
| --- | --- | --- | --- |
| PORTABILITY-PLAN-001 | application/persistence | `control-plane-portability.pglite.test.ts` | passing |
| PORTABILITY-EXPORT-002 | crypto/integration | `control-plane-portability.pglite.test.ts`; `instance-portability-command.test.ts` | passing |
| PORTABILITY-IMPORT-PLAN-003 | application/persistence | `control-plane-portability.pglite.test.ts` | passing |
| PORTABILITY-IMPORT-004 | persistence integration | `control-plane-portability.pglite.test.ts` | passing |
| PORTABILITY-REPLACE-005 | persistence integration | `control-plane-portability.pglite.test.ts` | passing |
| PORTABILITY-ROLLBACK-006 | persistence integration | `control-plane-portability.pglite.test.ts` | passing |
| PORTABILITY-CLEANUP-007 | provider/application | `control-plane-portability.pglite.test.ts` | passing |
| PORTABILITY-SURFACE-008 | API/CLI/Web | `data-safety-and-tunnel.http.test.ts`; `instance-portability-command.test.ts`; browser validation | passing |
