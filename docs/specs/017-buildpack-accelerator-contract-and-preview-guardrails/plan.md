# Plan: Buildpack Accelerator Contract And Preview Guardrails

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: ADR-010, ADR-012, ADR-014, ADR-016, ADR-021, ADR-023, ADR-024, ADR-025
- Operation map: `docs/BUSINESS_OPERATION_MAP.md`
- Local specs: `docs/workflows/workload-framework-detection-and-planning.md`,
  `docs/queries/deployments.plan.md`
- Test matrix: `docs/testing/workload-framework-detection-and-planning-test-matrix.md`,
  `docs/testing/deployment-plan-preview-test-matrix.md`
- Implementation plan: `docs/implementation/deployment-runtime-substrate-plan.md`
- Patterns to reuse:
  `docs/specs/014-framework-planner-contract-and-js-ts-catalog/*`,
  `docs/specs/015-python-framework-planner-contract-and-asgi-wsgi-catalog/*`, and
  `docs/specs/016-jvm-framework-planner-contract-and-spring-boot-catalog/*`

## ADR Need Decision

No new ADR is required for this Spec Round.

Rationale:

- ADR-012 places reusable source/runtime/network/health/config fields on Resource.
- ADR-014 keeps `deployments.create` ids-only and forbids framework/buildpack/runtime preset fields
  on deployment admission.
- ADR-016 keeps recovery write commands out of scope.
- ADR-021 already allows `auto`/buildpack-style planning only when it produces Docker/OCI image
  artifacts behind provider-neutral contracts.
- ADR-023 keeps runtime target capabilities and concrete execution details behind adapter/runtime
  boundaries.
- ADR-024 and ADR-025 keep repository config, CLI/Action state, identity, and control-plane mode
  selection separate from deployment admission.

A new ADR is required before Appaloft exposes public buildpack builder/lifecycle fields, accepts a
non-Docker substrate, changes `deployments.create`, or makes a buildpack implementation the
canonical support path for mainstream frameworks.

## Architecture Approach

- Domain/application placement: define provider-neutral preview/contract shape in application and
  contracts. Keep concrete buildpack detection, builder policy, lifecycle compatibility, and future
  `pack` execution in runtime adapter/provider packages.
- Reusable planner pattern: evidence -> precedence decision -> support tier -> artifact intent ->
  limitations -> blocked reason/remediation -> preview parity.
- Core impact: only add stable provider-neutral values if needed by tests. Do not add SDK or
  buildpack implementation types to core.
- Repository/specification/visitor impact: none for this preview contract slice.
- Event/CQRS/read-model impact: `deployments.plan` stays a query; no events or mutations.
- Entrypoint impact: API/oRPC, CLI, Web, repository config, and future tools consume the same
  resource profile vocabulary and preview output.
- Persistence/migration impact: none for this slice; deployment snapshots remain immutable only
  after `deployments.create`.

## Buildpack Accelerator Contract

The preview contract should expose:

- detected platform files, such as `project.toml`, `Procfile`, `.buildpacks`, `.cnb`, builder
  config, language manifests, and lockfiles;
- language-family hints and framework hints;
- builder evidence, default builder policy, allowed override policy, blocked builder policy, and
  unsupported lifecycle feature reason;
- detected buildpack ids/names/versions when safe;
- precedence decision and whether buildpack was winning, non-winning, disabled, unavailable,
  ambiguous, or blocked;
- support tier values: `first-class`, `generic`, `custom`, `container-native`,
  `buildpack-accelerated`, `unsupported`, `ambiguous`, and `requires-override`;
- Docker/OCI image artifact intent only; buildpack output cannot generate deployment input
  overrides;
- limitations explaining missing first-class support, unavailable real execution, unsupported
  builder/lifecycle features, missing internal port, missing start intent, or ambiguous evidence;
- next actions pointing to resource configuration commands, draft edits, explicit custom commands,
  or later first-class planner support.

## Roadmap And Compatibility

- Roadmap target: Phase 5 `0.7.0` gate.
- Version target: pre-`1.0.0`; no release version is changed by this feature artifact.
- Compatibility impact: additive/hardening under pre-`1.0` policy. It adds preview/contract fields
  and reason codes, but no deployment write commands and no deployment admission input.
- Public surface: `deployments.plan/v1`, CLI/Web rendering of that contract, public docs/help
  wording only if Code Round changes visible copy.

## Testing Strategy

- Matrix ids: add buildpack rows `WF-PLAN-BP-001` through `WF-PLAN-BP-010` and preview contract
  rows `DPP-CATALOG-BP-001` through `DPP-CATALOG-BP-002`.
- Test-first rows: create contract tests before production implementation.
- Acceptance/e2e: not required for real buildpack execution in this round; hermetic fake adapter
  evidence is sufficient.
- Contract/integration/unit: prove precedence, support tier, reason codes, artifact intent,
  network/health/env guardrails, and preview parity.

## Risks And Migration Gaps

- Real `pack`/lifecycle execution is intentionally deferred until a later adapter Code Round.
- Public docs may need a short user-facing explanation if the preview begins showing buildpack
  limitations in Web/CLI.
- Future family planners must not depend on buildpack evidence as their only implementation.
  Buildpack evidence can seed fixtures and diagnostics, but first-class planner support requires
  explicit rows and tests.

## Post-Implementation Notes

The first Code Round implemented the public preview contract shape and executable
`deployments.plan/v1` contract tests for ready and blocked buildpack accelerator output. It did not
wire a real buildpack resolver or lifecycle execution. The optional buildpack preview field is
therefore ready for adapter-owned hermetic/fake evidence in a later Code Round, while the
deployment admission surface remains unchanged.
