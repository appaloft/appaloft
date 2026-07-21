# Plan: Zero-Configuration Deployment Support Contract

## Governing Sources

- `docs/BUSINESS_OPERATION_MAP.md`: workload framework detection, Quick Deploy, deployment plan,
  and deployment create workflow positions.
- ADR-012, ADR-014, ADR-015, ADR-021, and ADR-023: Resource profile ownership, ids-only deployment
  admission, network ownership, Docker/OCI substrate, and runtime target boundary.
- `docs/workflows/workload-framework-detection-and-planning.md` and
  `docs/workflows/quick-deploy.md`.
- `docs/testing/workload-framework-detection-and-planning-test-matrix.md` and
  `docs/testing/public-documentation-test-matrix.md`.
- Active smoke inventory in
  `apps/shell/test/e2e/support/framework-docker-smoke-fixtures.ts`,
  `apps/shell/test/e2e/framework-smoke-coverage.test.ts`, and
  `.github/workflows/framework-fixture-e2e.yml`.
- Current source implementation evidence in the filesystem detector and local runtime execution
  adapter, read only for documentation accuracy.

## ADR Need Decision

No new ADR is required. This change does not alter ownership, deployment admission, runtime
substrate, source state, or execution behavior. It makes current support claims conform to accepted
boundaries and evidence. Completing remote source inspection, archive materialization, or automatic
monorepo application selection may require later design work, but this round does not decide those
interfaces.

## Implementation And Documentation Approach

1. Use the implemented bounded workspace discovery and explicit `baseDirectory` path in both create
   and plan; zero/multiple candidate roots fail closed.
2. Mark public remote Git automatic framework/runtime detection Unsupported because remote
   repositories are not cloned for inspection; retain Preview only for explicit container-native or
   command profiles pending dedicated source-to-runtime smoke.
3. Expose stable plan version/fingerprint and command provenance in plan evidence.
4. Define Supported, Preview, and Unsupported from implementation plus passed real-smoke evidence.
5. Add the current matrix, evidence/reason requirements, override precedence, and fail-closed
   troubleshooting to the governing workload workflow.
6. Add stable matrix ids for support classification, source boundaries, plan identity, command
   provenance, and troubleshooting.
7. Publish the same user-facing facts in English and Chinese under one stable anchor.
8. Link first-deployment guidance to the support matrix.

## Verification Strategy

| ID | Verification | Evidence |
| --- | --- | --- |
| ZERO-CONFIG-SUPPORT-001 | Compare every Supported framework group with passed real Appaloft Docker fixture/substrate evidence. | Descriptor, coverage test, and smoke result review. |
| ZERO-CONFIG-SUPPORT-002 | Confirm public remote-Git automatic detection is Unsupported and only explicit container-native or command profiles remain Preview pending dedicated test/real-smoke closure. | Filesystem detector, application planning, and smoke inventory review. |
| ZERO-CONFIG-SUPPORT-003 | Confirm workload archive auto-detection is distinct from static artifact publication. | Source-kind detector and public static-artifact docs review. |
| ZERO-CONFIG-SUPPORT-004 | Confirm bounded monorepo discovery, explicit base-directory use in create/plan, and ambiguity blocking. | Detector tests and application create/plan source review. |
| ZERO-CONFIG-SUPPORT-005 | Reconcile override order across workflow, feature spec, and public docs. | Documentation diff review. |
| ZERO-CONFIG-SUPPORT-006 | Build or contract-check public docs and verify locale anchors match. | Docs verification command. |
| ZERO-CONFIG-SUPPORT-007 | Confirm stable plan version/fingerprint behavior. | Plan query spec, response contract, and contract tests. |
| ZERO-CONFIG-SUPPORT-008 | Confirm command provenance distinguishes planner inference from explicit profile commands. | Plan response contract and query-service tests/source. |

## Compatibility And Deferred Gaps

- This feature artifact records implemented additive behavior under the existing pre-1.0 planning
  contract; the current docs pass adds no TypeScript change.
- Public remote Git automatic framework/runtime detection is Unsupported. Explicit container-native
  or command remote-Git profiles and bounded local monorepo discovery remain Preview until matching
  source-to-runtime real smoke exists. Multiple candidate roots remain Unsupported until explicitly
  overridden.
- General workload archives, inferred unsupported hybrid modes, and buildpack execution remain
  Unsupported.
- Passed real Appaloft Docker smoke promotes Sinatra/Rack, Go Gin, ASP.NET Core, and Rust Axum.
  Rails, Laravel, Symfony, and Phoenix remain Preview.
