# Tasks: Domain Binding Show/Configure/Delete/Retry Lifecycle

## Spec / Verification

- [x] Confirm `origin/main` includes PR #148 and use it as baseline.
- [x] Confirm latest tag, package version, Release Please manifest, and roadmap alignment are
  `0.7.0` published with active target Phase 6 / `0.8.0`.
- [x] Read governing ADRs, global contracts, operation maps, routing/domain/TLS specs, route
  intent/status spec, public docs governance, and operation catalog.
- [x] Produce traceability table for show/readback, configure-route, delete-check/delete,
  verification retry, generated access fallback, durable route status, proxy/health/diagnostics,
  and public docs/help anchors.
- [x] Record no-new-ADR rationale and generic-update naming decision.

## Code

- [x] Add `domain-bindings.show`.
- [x] Add `domain-bindings.configure-route` as the specific route-behavior update operation.
- [x] Add `domain-bindings.delete-check`.
- [x] Add guarded `domain-bindings.delete`.
- [x] Add `domain-bindings.retry-verification`.
- [x] Keep certificate readiness read-only and do not add certificate revoke/delete/retry.
- [x] Keep `deployments.create` ids-only and do not add deployment retry/redeploy/rollback.

## Docs / Sync

- [x] Sync `BUSINESS_OPERATION_MAP.md`, `CORE_OPERATIONS.md`, operation catalog, docs registry, and
  public docs/help anchors.
- [x] Update roadmap Phase 6 checklist only for completed domain binding lifecycle work.
- [x] Run targeted tests/typecheck:
  - `bun test packages/application/test/domain-binding-lifecycle.test.ts`
  - `bun test ./apps/shell/test/e2e/domain-bindings.command.e2e.ts`
  - `bun test packages/docs-registry/test/operation-coverage.test.ts`
  - package typecheck for core, application, contracts, oRPC, CLI, shell, persistence/pg, i18n,
    docs-registry, and Web.
  - `bun run lint`
