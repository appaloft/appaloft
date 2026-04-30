# Plan: Framework Planner Contract And JavaScript/TypeScript Tested Catalog

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: ADR-010, ADR-012, ADR-014, ADR-016, ADR-021, ADR-023
- Operation map: `docs/BUSINESS_OPERATION_MAP.md`
- Local specs: `docs/workflows/workload-framework-detection-and-planning.md`, `docs/queries/deployments.plan.md`
- Test matrix: `docs/testing/workload-framework-detection-and-planning-test-matrix.md`, `docs/testing/deployment-plan-preview-test-matrix.md`
- Implementation plan: `docs/implementation/deployment-runtime-substrate-plan.md`

## Architecture Approach

- Domain/application placement: keep framework detection and generated Dockerfile planning outside core; use typed source inspection and runtime plan output at the application/adapter boundary.
- Repository/specification/visitor impact: none; this work does not add persistence or repository filters.
- Event/CQRS/read-model impact: `deployments.plan` stays a query and does not publish events or mutate state.
- Entrypoint impact: Web, CLI, API/oRPC, repository config, and future tools consume the same resource profile vocabulary and preview output.
- Persistence/migration impact: none for this slice; deployment snapshots remain immutable only after `deployments.create`.

## Planner Contract

Every tested framework row must prove:

- framework/runtime evidence and package/project name where safe;
- planner key and support tier inputs;
- package manager detection and command selection;
- install/build/start/package command specs or explicit absence for static/prebuilt cases;
- artifact kind and output path, including Dockerfile generation intent;
- internal port default or required override behavior;
- health plan defaults;
- unsupported, ambiguous, missing command, missing static output, or missing port reasons;
- `deployments.plan` output parity for the same evidence shape;
- CLI/API/Web draft or preview parity through resource-profile fields.

## Roadmap And Compatibility

- Roadmap target: Phase 5 `0.7.0` gate.
- Version target: pre-`1.0.0`; no release version is changed by this feature artifact.
- Compatibility impact: additive/hardening under pre-`1.0` policy. It does not add deployment write commands and does not change deployment admission input.

## Testing Strategy

- Matrix ids: add JS/TS catalog closure ids `WF-PLAN-JS-001` through `WF-PLAN-JS-013` and preview contract ids `DPP-CATALOG-001` through `DPP-CATALOG-002`.
- Test-first rows: bind fixture catalog tests to the new JS/TS ids before marking the roadmap item complete.
- Acceptance/e2e: keep representative opt-in local Docker smoke under `WF-PLAN-SMOKE-005`; full fixture-by-fixture real Docker/SSH smoke remains a migration gap.
- Contract/integration/unit: runtime fixture tests prove planner/base image/command/artifact/port shape; contracts tests prove `deployments.plan/v1` can expose the same planner shape.

## Risks And Migration Gaps

- SvelteKit server, Astro SSR, and Nuxt SSR/server modes are not promoted unless deterministic start evidence exists.
- Full browser-level Web/CLI parity for every fixture remains broader hardening; current parity is shared draft vocabulary plus preview contract.
- Full real Docker/SSH smoke for every JS/TS fixture remains a migration gap; headless Docker/OCI readiness is the tested catalog closure for this round.
