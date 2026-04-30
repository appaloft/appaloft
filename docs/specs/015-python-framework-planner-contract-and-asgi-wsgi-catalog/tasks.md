# Tasks: Python Framework Planner Contract And ASGI/WSGI Tested Catalog

## Spec Round

- [x] Confirm PR #140 is merged and base this work on `main`.
- [x] Locate the behavior in `docs/BUSINESS_OPERATION_MAP.md` as workload framework detection/planning plus `deployments.plan`.
- [x] Read ADR-010, ADR-012, ADR-014, ADR-016, ADR-021, and ADR-023.
- [x] Record no-new-ADR rationale in the feature spec.
- [x] Create `docs/specs/015-python-framework-planner-contract-and-asgi-wsgi-catalog/spec.md`.
- [x] Create `docs/specs/015-python-framework-planner-contract-and-asgi-wsgi-catalog/plan.md`.
- [x] Create this task checklist.
- [x] Sync workflow/query/runtime-substrate docs with Python planner contract boundaries.

## Test-First

- [x] Add stable Python matrix ids for FastAPI with `uv`, Django with pip/requirements, Flask with pip/requirements, generic ASGI, generic WSGI, Poetry, explicit fallback commands, package-tool precedence, missing ASGI/WSGI app, ambiguous app target, missing production start, unsupported evidence, and internal-port behavior.
- [x] Bind existing and new fixture planner tests to the new Python matrix ids.
- [x] Add `deployments.plan` catalog contract rows for ready Python preview and blocked unsupported/ambiguous/missing Python preview.
- [x] Add executable contract test coverage for `deployments.plan/v1` Python catalog output shape.

## Implementation

- [x] Consolidate or refine Python planner contract types/services only where tests reveal a catalog contract gap.
- [x] Add or update Python fixture projects for deterministic ASGI, deterministic WSGI, Poetry, explicit start-command fallback, and blocked ASGI/WSGI evidence.
- [x] Ensure generated Dockerfile evidence includes Python package tool, install command, start command, base image, artifact kind, and internal HTTP verification metadata.
- [x] Ensure `deployments.create` remains ids-only and no Python planner fields are accepted by deployment admission.

## Entrypoints And Docs

- [x] Update roadmap and implementation notes to mark Python tested catalog closure without claiming full real Docker/SSH fixture coverage.
- [x] Update `deployments.plan` query/test matrix status for Python preview parity.
- [x] Record public docs/help outcome for this behavior.

## Verification

- [x] Run targeted runtime fixture tests.
- [x] Run targeted filesystem fixture tests.
- [x] Run targeted contracts test for deployment plan preview schema.
- [x] Run targeted typecheck or document why it was not run.

## Post-Implementation Sync

- [x] Reconcile feature artifact, roadmap, operation map, workflow docs, implementation plan, test matrices, public docs/help gaps, and executable test bindings.
