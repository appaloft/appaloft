# Platform Migration Journey Test Matrix

| ID | Level | Evidence target | Binding | Status |
| --- | --- | --- | --- | --- |
| MIG-BUNDLE-001 | unit/contract | strict deterministic secret-safe bundle parsing | `packages/application/test/platform-migration-bundle.test.ts` | passing |
| MIG-SOURCE-002 | adapter contract | Railway translation and unsupported blockers | `packages/adapters/railway-migration/test/railway-migration-source.test.ts` | passing |
| MIG-PLAN-003 | application | no-effect operation plan and digest | `packages/application/test/platform-migration-plan.test.ts` | passing |
| MIG-APPLY-004 | application/integration | ordered CommandBus dispatch, receipts and idempotency | `packages/application/test/platform-migration-apply.test.ts` | passing |
| MIG-READ-005 | integration | safe existing-query status/readback | `packages/application/test/platform-migration-readback.test.ts` | passing |
| MIG-FAIL-006 | integration | partial failure, resume and no later dependent effects | `packages/application/test/platform-migration-apply.test.ts`; `packages/adapters/cli/test/migration-command.test.ts` | passing |
| MIG-VERIFY-007 | integration | health/proof/config/domain/data evidence | `packages/application/test/platform-migration-readback.test.ts`; real packets below | passing |
| MIG-CLEAN-008 | integration | reverse exact cleanup preserving reused state | `packages/application/test/platform-migration-cleanup.test.ts` | passing |
| MIG-SURFACE-009 | contract | CLI/JSON/HTTP/oRPC/SDK/Web parity | `packages/adapters/cli/test/migration-command.test.ts`; `packages/orpc/test/platform-migration.http.test.ts`; `apps/web/src/routes/migrate/platform/platform-migration-page.test.ts`; SDK facade snapshot | passing |
| MIG-WEB-010 | real e2e | fresh web migration/rollback/cleanup | `apps/shell/test/e2e/platform-migration-web.workflow.e2e.ts` | passing |
| MIG-COMPOSE-011 | real e2e | multi-service migration/recovery/cleanup | `apps/shell/test/e2e/platform-migration-compose.workflow.e2e.ts` | passing |
| MIG-STATEFUL-012 | real e2e | dependency/volume/domain/TLS/backup/restore/exit | `apps/shell/test/e2e/platform-migration-stateful.workflow.e2e.ts` | passing |
| MIG-AUTH-013 | integration | role/tenant/entitlement/secret safety | `packages/orpc/test/platform-migration.http.test.ts`; `packages/adapters/cli/test/migration-secret-resolver.test.ts`; Cloud composed authz/entitlement tests | passing |
| MIG-COMPAT-014 | contract | existing operation compatibility/no duplicate lifecycle | operation catalog, docs registry, full public gates and final public/private Boundary Review | passing |

No R4 completion claim is permitted until `MIG-WEB-010`, `MIG-COMPOSE-011` and
`MIG-STATEFUL-012` have current real evidence with exact cleanup.

## Current Evidence (2026-08-13)

- `MIG-WEB-010`: 1 pass, 16 assertions, fresh local Docker deployment, rollback and exact cleanup.
- `MIG-COMPOSE-011`: 1 pass, 20 assertions, multi-service recovery and exact cleanup.
- `MIG-STATEFUL-012`: 1 pass, 84 assertions, Redis backup/restore, storage runtime realization,
  domain/TLS evidence and exact cleanup after explicit backup prune.
- Public gates: `bun run lint`, `bun run typecheck`, `bun run test`, and `bun run build` passed.
- Docs-impact outcome: new complete bilingual task page and stable anchor
  `/docs/migrate/platform/#platform-migration`, registered as `migration.platform`; no migration gap.
- Public implementation PR #1090 merged at `c4a0a4203759380566034c53fa77d420b9a0fe3e` after
  Biome, typecheck, unit/integration, two E2E shards, build/smoke and six native Workspace TUI target
  checks passed.
- Cloud pinned that public `main` SHA; composed authz/admission/secret tests passed, and the
  independent Public/Private Boundary Review returned `PASS`. It found no private migration type,
  table, operation, adapter, DTO, repository or service and no P0/P1/P2 finding.
