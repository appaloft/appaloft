# Tasks: Real Traefik Access Failure Middleware E2E Baseline

## Test-First

- [x] `RES-ACCESS-DIAG-REAL-001`: add/update Traefik provider contract coverage for served-route
  error middleware with safe applied route context.
- [x] `RES-ACCESS-DIAG-REAL-002`: add/update HTTP renderer coverage for real-proxy request id,
  affected host/path normalization, evidence capture, and redaction.
- [x] `RES-ACCESS-DIAG-REAL-003`: add opt-in real Traefik Docker e2e coverage for a
  gateway-generated upstream failure and request-id lookup.
- [x] `ROUTE-TLS-BOUNDARY-009`: assert the real Traefik baseline does not create managed
  `DomainBinding`, `Certificate`, route repair, redeploy, rollback, or provider-native raw parsing
  behavior.

## Source Of Truth

- [x] Update `docs/testing/resource-access-failure-diagnostics-test-matrix.md`.
- [x] Update `docs/testing/routing-domain-and-tls-test-matrix.md`.
- [x] Update `docs/PRODUCT_ROADMAP.md` Phase 6 verification notes.
- [x] Update `docs/DOMAIN_MODEL.md` only if the implementation changes ownership language.
- [x] Keep `docs/CORE_OPERATIONS.md` and `packages/application/src/operation-catalog.ts`
  unchanged unless a public operation/schema changes.

## Implementation

- [x] Reuse existing `resource-access-failure/v1` classification/rendering/evidence capture.
- [x] Reuse existing `applied-route-context/v1` sanitization and lookup path.
- [x] Keep Traefik-specific middleware rendering inside `packages/providers/edge-proxy-traefik`.
- [x] Keep runtime renderer target resolution inside shell/runtime composition; do not add a new
  provider-native lookup store.

## Entrypoints And Docs

- [x] Reuse existing HTTP renderer and `resources.access-failure-evidence.lookup` API/CLI surfaces.
- [x] Do not add Web lookup form or route repair/redeploy/rollback entrypoints.
- [x] Reuse existing public diagnostics troubleshooting anchors.

## Verification

- [x] Run targeted Traefik provider tests.
- [x] Run targeted HTTP renderer tests.
- [x] Run targeted application/evidence lookup tests if touched.
- [x] Run the opt-in real Traefik e2e target when Docker is available.
- [x] Run `bun install --frozen-lockfile`.
- [x] Run `bun run typecheck`.
- [x] Run `bun run lint`.

## Post-Implementation Sync

- [x] Mark matrix rows and tasks with actual test bindings/results.
- [x] Record remaining Phase 6 gaps.
- [x] Commit, push, open PR, and report CI state without bypassing external infra failures.

Verification notes:

- `RES-ACCESS-DIAG-REAL-001` is covered by
  `packages/providers/edge-proxy-traefik/test/provider.test.ts`.
- `RES-ACCESS-DIAG-REAL-002` is covered by
  `packages/adapters/http-elysia/test/resource-access-failure-diagnostics.test.ts`.
- `RES-ACCESS-DIAG-REAL-003` and `ROUTE-TLS-BOUNDARY-009` are covered by the opt-in Docker target
  in `apps/shell/test/e2e/routing-domain-and-tls-proxy.workflow.e2e.ts`; the default run skips
  without `APPALOFT_E2E_PROXY_DOCKER=true`. The local opt-in run reached real Traefik, returned the
  safe diagnostic HTML, and retrieved the captured request id through the existing CLI evidence
  lookup.
