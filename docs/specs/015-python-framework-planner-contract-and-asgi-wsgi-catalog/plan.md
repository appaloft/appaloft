# Plan: Python Framework Planner Contract And ASGI/WSGI Tested Catalog

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: ADR-010, ADR-012, ADR-014, ADR-016, ADR-021, ADR-023
- Operation map: `docs/BUSINESS_OPERATION_MAP.md`
- Local specs: `docs/workflows/workload-framework-detection-and-planning.md`, `docs/queries/deployments.plan.md`
- Test matrix: `docs/testing/workload-framework-detection-and-planning-test-matrix.md`, `docs/testing/deployment-plan-preview-test-matrix.md`
- Implementation plan: `docs/implementation/deployment-runtime-substrate-plan.md`
- Pattern to reuse: `docs/specs/014-framework-planner-contract-and-js-ts-catalog/*`

## Architecture Approach

- Domain/application placement: keep Python framework detection, package manifest parsing,
  ASGI/WSGI discovery, and generated Dockerfile planning outside core; expose only typed source
  inspection and runtime plan output at the application/adapter boundary.
- Repository/specification/visitor impact: none; this work does not add persistence or repository
  filters.
- Event/CQRS/read-model impact: `deployments.plan` stays a query and does not publish events or
  mutate state.
- Entrypoint impact: Web, CLI, API/oRPC, repository config, and future tools consume the same
  resource profile vocabulary and preview output.
- Persistence/migration impact: none for this slice; deployment snapshots remain immutable only
  after `deployments.create`.

## Planner Contract

Every tested Python row must prove:

- Python runtime evidence, package/project name where safe, and detected files/scripts;
- planner key and support tier inputs;
- package tool detection across explicit profile, `uv.lock`, Poetry metadata/`poetry.lock`, PEP
  621 `pyproject.toml`, `requirements.txt`, and generic pip fallback;
- `uv.lock` rows use a real lockfile and a `uv` Python base image so real Docker smoke does not
  bootstrap `uv` by downloading the package manager through pip during each build;
- Poetry metadata rows install through the Poetry build backend with `pip install .` so real Docker
  smoke does not bootstrap the Poetry CLI in runtime images;
- pip-based Python rows render retry/timeout flags on dependency installs so GitHub Actions/local explicit real Docker
  smoke is resilient to slow package index responses without weakening planner semantics;
- install/build/start/package command specs or explicit absence;
- ASGI/WSGI module/app discovery rules and explicit fallback behavior;
- artifact kind and output path, including Dockerfile generation intent;
- internal port default or required override behavior;
- health plan defaults;
- unsupported, ambiguous, missing app, missing command, or missing port reasons;
- `deployments.plan` output parity for the same evidence shape;
- CLI/API/Web draft or preview parity through resource-profile fields.

## Roadmap And Compatibility

- Roadmap target: Phase 5 `0.7.0` gate.
- Version target: pre-`1.0.0`; no release version is changed by this feature artifact.
- Compatibility impact: additive/hardening under pre-`1.0` policy. It does not add deployment
  write commands and does not change deployment admission input.

## Testing Strategy

- Matrix ids: add Python catalog closure ids `WF-PLAN-PY-001` through `WF-PLAN-PY-013` and preview
  contract ids `DPP-CATALOG-003` through `DPP-CATALOG-004`.
- Test-first rows: bind fixture catalog tests to the new Python ids before marking the roadmap item
  complete.
- Acceptance/e2e: keep Python local Docker and generic-SSH fixture smoke in
  `WF-PLAN-SMOKE-005` and `WF-PLAN-SMOKE-006`; both use the shared framework smoke descriptor list
  and run as GitHub Actions/local explicit gates because they mutate Docker or SSH targets.
- Contract/integration/unit: runtime fixture tests prove planner/base image/command/artifact/port
  shape; contract tests prove `deployments.plan/v1` can expose the same Python planner shape.

## Risks And Migration Gaps

- Framework-native development servers such as `manage.py runserver` and `flask run` may remain
  fixture-only baselines until the Code Round can promote production Gunicorn/Uvicorn command
  policy with deterministic ASGI/WSGI target discovery.
- Full browser-level Web/CLI parity for every Python fixture remains broader hardening; current
  parity is shared draft vocabulary plus preview contract.
- Deeper production command hardening, for example richer Django static collection policy, remains
  broader planner hardening; local Docker and generic-SSH Python fixture smoke coverage is available
  through the shared GitHub Actions/local explicit framework smoke gates, while fast local
  automation stays hermetic.
