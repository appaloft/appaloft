# Tasks: Resource Access Route Precedence

## Test-First
- [x] DEF-ACCESS-ENTRY-008: add Web unit coverage at `apps/web/src/lib/console/resource-access-route.test.ts`.
- [x] DEF-ACCESS-ENTRY-008: add WebView resource-detail assertion at `apps/web/test/e2e-webview/home.webview.test.ts`.

## Source Of Truth
- [x] Update `docs/testing/default-access-domain-and-proxy-routing-test-matrix.md`.
- [x] Update `docs/workflows/default-access-domain-and-proxy-routing.md`.
- [x] Update `docs/implementation/default-access-domain-and-proxy-routing-plan.md`.
- [x] Update `docs/PRODUCT_ROADMAP.md`.
- [x] Update public docs traceability and generated-routes public docs.

## Implementation
- [x] Add shared Web current-route selector over `ResourceAccessSummary`.
- [x] Use the selector in resource detail access URL display.
- [x] Use the selector in Quick Deploy resource review and completion feedback.

## Entrypoints And Docs
- [x] Confirm API schema and operation catalog are unchanged.
- [x] Confirm public docs reuse `/docs/access/generated-routes/#access-generated-route`.

## Verification
- [x] Run Web route selector unit test.
- [x] Run WebView e2e test for route precedence.
- [x] Run Web typecheck.
- [x] Run lint.

## Post-Implementation Sync
- [x] Reconcile spec, plan, tasks, roadmap, docs, tests, and code.
