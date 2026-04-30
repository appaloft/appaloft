# Plan: Zero-to-SSH Supported Catalog Acceptance Harness

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: ADR-012, ADR-014, ADR-015, ADR-016, ADR-021, ADR-023, ADR-024, ADR-025
- Operation map: `docs/BUSINESS_OPERATION_MAP.md`
- Operation catalog: `docs/CORE_OPERATIONS.md`, `packages/application/src/operation-catalog.ts`
- Global contracts: `docs/errors/model.md`,
  `docs/errors/neverthrow-conventions.md`,
  `docs/architecture/async-lifecycle-and-acceptance.md`
- Local specs: `docs/workflows/workload-framework-detection-and-planning.md`,
  `docs/workflows/deployment-runtime-target-abstraction.md`,
  `docs/queries/deployments.plan.md`, `docs/commands/deployments.create.md`
- Implementation plans: `docs/implementation/deployment-runtime-substrate-plan.md`
- Related feature artifacts: specs 013, 014, 015, 016, 017, and 018
- Test matrix: `docs/testing/workload-framework-detection-and-planning-test-matrix.md`,
  `docs/testing/deployment-plan-preview-test-matrix.md`,
  `docs/testing/deployments.create-test-matrix.md`

## ADR Need Decision

No new ADR is required for this behavior. The harness enforces existing accepted boundaries:

- ADR-012/014/015 already place source/runtime/network/health/profile ownership on Resource and
  keep `deployments.create` ids-only.
- ADR-016 already forbids expanding the v1 deployment write surface with retry, redeploy, rollback,
  or a new admission command.
- ADR-021 already requires Docker/OCI artifacts for v1 plans.
- ADR-023 already requires runtime target backend selection behind provider-neutral contracts.
- ADR-024/025 already govern SSH state/control-plane mode without requiring a real SSH target as a
  default test dependency.

A new ADR is required before Appaloft changes deployment admission fields, introduces a non-Docker
runtime substrate, makes buildpack execution the canonical path, or exposes a new runtime target
command/surface.

## Architecture Approach

- Domain/application placement: keep the harness as contract/test infrastructure over existing
  resource profile, deployment plan, deployment create, and runtime target ports.
- Provider-neutral contract fields: add or refine only if the harness reveals missing stable
  planner/artifact/target/observation fields. Do not add Docker/SSH SDK shapes to core.
- Reusable descriptors: consolidate supported fixture descriptors for planner expectation,
  resource profile draft, preview/create parity, runtime target capability, and observation
  expectation.
- Runtime target fixtures: default to hermetic fake/local/generic-SSH capability selection and
  typed command rendering. Real Docker/SSH smoke remains opt-in.
- CQRS/read-model impact: no new command/query. Observation is asserted through existing
  readiness/health/log/access read-model contracts.
- Entrypoint impact: Web/API/CLI/repository config/future tools share the same resource profile
  draft and `deployments.plan`/`deployments.create` schemas.
- Persistence/migration impact: none expected. This is harness and contract closure.

## Roadmap And Compatibility

- Roadmap target: Phase 5 `0.7.0` exit criterion.
- Version target: `0.7.0` only when all Phase 5 required items and exit criteria are checked.
- Compatibility impact: additive hardening under pre-`1.0-policy`; no deployment command or route
  input expansion.
- Release note input: supported catalog entries are now governed by a reusable zero-to-SSH
  acceptance harness; real Docker/SSH full-catalog execution remains opt-in or migration gap unless
  explicitly enabled.

## Testing Strategy

- Matrix ids:
  - `ZSSH-CATALOG-001` through `ZSSH-CATALOG-016` for required fixture catalog closure.
  - `ZSSH-PREVIEW-001` through `ZSSH-PREVIEW-004` for preview readiness and blocked parity.
  - `ZSSH-CREATE-001` through `ZSSH-CREATE-004` for ids-only create and admission parity.
  - `ZSSH-RUNTIME-001` through `ZSSH-RUNTIME-005` for target backend, artifact, observation, and
    opt-in smoke gating.
- Hermetic default tests:
  - table-driven fixture descriptors;
  - `deployments.plan/v1` ready/blocked schema contract payloads;
  - resource profile draft to runtime plan resolver;
  - typed Docker build/run command rendering;
  - runtime target backend registry selection for local-shell and generic-SSH;
  - readiness/health/log/access observation expectation shape.
- Opt-in tests:
  - representative real local Docker smoke remains gated by
    `APPALOFT_E2E_FRAMEWORK_DOCKER=true`;
  - real generic-SSH smoke remains gated by explicit SSH target configuration.

## Risks And Migration Gaps

- Current `deployments.create` still executes runtime work inside the use case as a migration gap
  against the acceptance-first contract. The harness must assert the stable boundary without
  pretending async process-manager closure is done.
- Full real Docker and real SSH coverage for every catalog fixture remains too expensive and
  environment-sensitive for default CI. The default contract is hermetic; real smoke is opt-in.
- Generic Node/Python/Java support tier naming may need future user-facing copy refinement, but it
  does not block this harness while planner/artifact/create behavior is covered.
- Public docs/help do not need a new page unless user-facing support text changes; record this as
  a Docs Round outcome in tasks.

## Current Implementation Notes

- `packages/adapters/runtime/test/zero-to-ssh-supported-catalog-acceptance.test.ts` implements the
  hermetic ZSSH harness for all required Phase 5 supported catalog entries.
- The harness uses existing planners and container-native resolver behavior only. It does not add
  Go, Ruby, PHP, .NET, Rust, Elixir, or any other planner family.
- The default harness proves preview contract shape, ids-only create input, runtime target backend
  selection for local-shell and generic-SSH, Docker/OCI artifact intent parity, typed command
  rendering for container image paths, and normalized readiness/health/log/access observation
  expectations.
- Real local Docker and real SSH fixture execution remain opt-in gates, not default CI
  requirements.
