# Plan: JVM Framework Planner Contract And Spring Boot Tested Catalog

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: ADR-010, ADR-012, ADR-014, ADR-016, ADR-021, ADR-023
- Operation map: `docs/BUSINESS_OPERATION_MAP.md`
- Local specs: `docs/workflows/workload-framework-detection-and-planning.md`,
  `docs/queries/deployments.plan.md`
- Test matrix: `docs/testing/workload-framework-detection-and-planning-test-matrix.md`,
  `docs/testing/deployment-plan-preview-test-matrix.md`
- Implementation plan: `docs/implementation/deployment-runtime-substrate-plan.md`
- Patterns to reuse:
  `docs/specs/014-framework-planner-contract-and-js-ts-catalog/*` and
  `docs/specs/015-python-framework-planner-contract-and-asgi-wsgi-catalog/*`

## Architecture Approach

- Domain/application placement: keep JVM framework detection, Maven/Gradle manifest parsing,
  Spring Boot evidence parsing, wrapper detection, runnable jar selection, and generated Dockerfile
  planning outside core; expose only typed source inspection and runtime plan output at the
  application/adapter boundary.
- Reusable planner pattern: use a family contract that every future language family can copy:
  evidence -> build tool -> planner key/support tier -> command specs -> artifact intent ->
  network/health -> blocked reason/remediation -> preview parity.
- Repository/specification/visitor impact: none; this work does not add persistence or repository
  filters.
- Event/CQRS/read-model impact: `deployments.plan` stays a query and does not publish events or
  mutate state.
- Entrypoint impact: Web, CLI, API/oRPC, repository config, and future tools consume the same
  resource profile vocabulary and preview output.
- Persistence/migration impact: none for this slice; deployment snapshots remain immutable only
  after `deployments.create`.

## Planner Contract

Every tested JVM row must prove:

- JVM runtime evidence, framework or generic jar shape, package/project name where safe, and
  detected files/scripts;
- planner key and support tier inputs;
- build tool detection across explicit profile, Maven wrapper, Maven, Gradle wrapper, Gradle, and
  Gradle Kotlin DSL;
- Java base image policy from `.java-version` or default Java version;
- build/package/start command specs or explicit absence;
- runnable jar discovery and deterministic fallback rules;
- artifact kind and output path, including Dockerfile generation intent;
- internal port default or required override behavior;
- health plan defaults, including actuator evidence when present and `/` fallback when absent;
- unsupported, ambiguous, missing build tool, missing runnable jar, missing production start, or
  missing port reasons;
- `deployments.plan` output parity for the same evidence shape;
- CLI/API/Web draft or preview parity through resource-profile fields.

## Roadmap And Compatibility

- Roadmap target: Phase 5 `0.7.0` gate.
- Version target: pre-`1.0.0`; no release version is changed by this feature artifact.
- Compatibility impact: additive/hardening under pre-`1.0` policy. It does not add deployment
  write commands and does not change deployment admission input.

## Testing Strategy

- Matrix ids: add JVM catalog closure ids `WF-PLAN-JVM-001` through `WF-PLAN-JVM-014` and preview
  contract ids `DPP-CATALOG-005` through `DPP-CATALOG-006`.
- Test-first rows: bind JVM/Spring fixture catalog tests to the new JVM ids before marking the
  roadmap item complete.
- Acceptance/e2e: keep representative opt-in local Docker smoke under existing smoke rows; full
  fixture-by-fixture real Docker/SSH smoke remains a migration gap.
- Contract/integration/unit: filesystem fixture tests prove JVM/Spring evidence; runtime fixture
  tests prove planner/base image/command/artifact/port/health shape; contract tests prove
  `deployments.plan/v1` can expose the same JVM planner shape.

## Risks And Migration Gaps

- Quarkus and Micronaut are not promoted in this round unless deterministic evidence and fixtures
  are added under the same contract.
- Full browser-level Web/CLI parity for every JVM fixture remains broader hardening; current parity
  is shared draft vocabulary plus preview contract.
- Full real Docker/SSH smoke for every JVM fixture remains a migration gap; headless Docker/OCI
  readiness is the tested catalog closure for this round.
- Buildpack-style detection remains a future adapter-owned accelerator. It must not replace
  explicit Spring Boot planner support or become a public deployment input.

## Public Docs And Help Outcome

Existing deployment lifecycle and resource source/runtime public docs anchors already explain plan
preview output and profile fix paths. This round adds JVM/Spring values to the existing
`deployments.plan/v1` shape without introducing a new public command, new field family, or new help
anchor. Public docs updates are not required for completion; fuller framework-specific public docs
remain a future docs hardening slice.
