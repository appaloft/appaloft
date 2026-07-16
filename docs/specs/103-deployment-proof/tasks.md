# Tasks: Deployment Proof

## Source Of Truth

- [x] Create spec/plan/tasks and classify public compatibility.
- [x] Add ADR-087 and query/workflow/error/Test Matrix contracts.
- [x] Synchronize Domain Model, Business Operation Map, Core Operations, Product Roadmap, ADR-021,
  public docs/help registry, and operation catalog.

## Test-First

- [x] Bind `DEP-PROOF-VERDICT-*`, `DEP-PROOF-SAFE-*`, and `DEP-PROOF-SCOPE-*` to application tests.
- [x] Bind `DEP-PROOF-ADAPTER-*` and `DEP-PROOF-SMOKE-*` to adapter and real Docker smoke tests.
- [x] Bind `DEP-PROOF-CONTRACT-*` to contract, HTTP, CLI, SDK, MCP, and Web tests.

## Implementation

- [x] Implement the shared DTO, safe fingerprint/effect derivation, query/service/handler, evidence
  port, mismatch lattice, and dependency injection.
- [x] Implement supported runtime adapter readback and explicit unavailable results.
- [x] Implement API/CLI/SDK/MCP/Web entrypoints from the shared operation.

## Cloud And Editorial

- [x] Add Cloud authz/tenant/composed-runtime consumption without redefining proof.
- [x] Add GitHub feedback summary and AI-facing success rule over public proof.
- [x] Publish evidence-based English and Chinese articles after real smoke passes.

## Verification And Sync

- [x] Run all named public/Cloud tests, typecheck/lint, and real Docker smokes.
- [x] Browser-check the bilingual blog at desktop/mobile widths and verify Deployment Detail through
  its structure test, shared DTO, and Cloud composed API/OpenAPI route.
- [x] Complete Post-Implementation Sync and dual-repository status/commit/PR checks.

## Managed Route Identity Hardening

- [x] Record that container labels are workload evidence, not public-route evidence, in ADR-087,
  the proof spec/workflow/query, and the Test Matrix.
- [x] Add failing provider tests for a deployment identity response header on Caddy and Traefik
  serve routes.
- [x] Add failing runtime evidence tests for matching, mismatched, and missing managed-route
  deployment identity.
- [x] Implement provider-stamped route identity and runtime public-route observation without
  changing the `deployments.proof/v1` schema.
- [x] Run focused provider/application/adapter tests and the real proxy-backed route proof smoke.
- [x] Complete Post-Implementation Sync and update this artifact state.
