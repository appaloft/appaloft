# Plan: Docker Swarm Runtime Target

## Scope

Spec-first slice for Docker Swarm as the first cluster runtime target backend. This plan keeps
`deployments.create` unchanged and prepares the Code Round that can register, select, render,
apply, observe, and clean up Swarm workloads through the runtime target abstraction.

## Governing Sources

- Domain model: [Domain Model](../../DOMAIN_MODEL.md)
- Decisions/ADRs: [ADR-021](../../decisions/ADR-021-docker-oci-workload-substrate.md),
  [ADR-023](../../decisions/ADR-023-runtime-orchestration-target-boundary.md)
- Local specs: [Deployment Runtime Target Abstraction](../../workflows/deployment-runtime-target-abstraction.md),
  [deployments.create](../../commands/deployments.create.md)
- Test matrix: [Docker Swarm Runtime Target Test Matrix](../../testing/docker-swarm-runtime-target-test-matrix.md)

## Architecture Approach

- Domain/application placement: keep target kind/provider/capability language provider-neutral.
  `DeploymentTarget`, `Destination`, `Resource`, and `Deployment` keep their current ownership;
  Swarm-specific stack/service details stay adapter-owned.
- Repository/specification/visitor impact: future Code Round may persist sanitized runtime target
  identity and summaries through existing deployment/read-model persistence. Raw Docker API
  responses, stack files, pull secrets, and service specs must not become aggregate state.
- Event/CQRS/read-model impact: command admission remains `deployments.create`; queries remain
  normalized read surfaces for runtime logs, resource health, proxy/diagnostic summaries, and
  target capacity. Existing deployment events remain canonical unless a later event spec adds
  Swarm-specific facts.
- Entrypoint impact: existing Web/API/CLI inputs must reject Swarm deployment fields. Future target
  registration/help may expose `orchestrator-cluster` plus provider key `docker-swarm` when schema
  and readiness rules are implemented.
- Persistence/migration impact: no migration in this Spec Round. Code Round may need a safe target
  execution identity shape for Swarm stack/service identifiers and rendered-plan fingerprints.

## Code Round Sequence

1. Add failing tests for the matrix rows before production Swarm implementation.
2. Extend target registration/readiness to accept a Docker Swarm manager target through
   provider-neutral target kind/provider/capability language.
3. Add a Swarm runtime target backend descriptor and registry selection coverage.
4. Implement Swarm render/apply/verify/log/health/cleanup behind `packages/adapters/runtime`
   without leaking Docker client types into core/application.
5. Add persistence/read-model support only for sanitized target summaries needed by deployment
   detail, resource health/logs, diagnostics, cleanup, and rollback-candidate identity.
6. Add CLI/API/Web/future MCP help or descriptions only through existing operations and generated
   operation descriptors.
7. Add public docs/help anchors and update roadmap after the closed loop passes tests.

## Roadmap And Compatibility

- Roadmap target: Phase 7 / `0.9.0` release gate toward `1.0.0`.
- Version target: pre-`1.0.0`; exact release is governed by `docs/PRODUCT_ROADMAP.md`.
- Compatibility impact: `pre-1.0-policy`, backward-compatible new target backend when implemented.
  Deployment admission remains stable; target registration/readiness output may gain new normalized
  backend summaries.

## Testing Strategy

- Matrix ids: `SWARM-TARGET-*` in the Docker Swarm runtime target matrix.
- Test-first rows: target registration/readiness, ids-only deployment admission, backend registry
  selection, render/apply/verify/log/health/cleanup, route realization, error mapping, and
  public-surface redaction.
- Acceptance/e2e: fake Swarm backend required for default CI; real Swarm smoke tests should be
  opt-in.
- Contract/integration/unit: adapter contract tests for rendered intent and normalized results;
  application tests for capability selection and unsupported target behavior.

## Risks And Migration Gaps

- Registry push/pull policy for buildable sources is unresolved.
- Replicas and update strategy are intentionally defaulted/deferred until target/profile
  configuration owns them.
- Capacity diagnostics may be partial depending on manager/node visibility.
- Public docs are required before this can be called product-complete.
