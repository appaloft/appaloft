# Python Framework Planner Contract And ASGI/WSGI Tested Catalog

## Status

- Round: Spec Round -> Test-First Round -> Code Round
- Artifact state: Python catalog hardening implemented; Post-Implementation Sync in progress
- Roadmap target: Phase 5 First-Deploy Engine And Framework Breadth (`0.7.0` gate)
- Compatibility impact: `pre-1.0-policy`; hardens public preview output and planner diagnostics without adding deployment admission fields

## Business Outcome

Operators deploying Python web services can see a stable, explainable workload plan before runtime
execution. Appaloft should identify the Python packaging tool, web framework or generic ASGI/WSGI
shape, selected planner, Docker/OCI artifact intent, command specs, required port behavior, health
defaults, and any fix path before `deployments.create` starts.

This work reuses the framework planner contract established by the JavaScript/TypeScript catalog
closure. The outcome is catalog confidence and a reusable family-planner pattern for later JVM,
Go, Ruby, PHP, .NET, Rust, and Elixir planners, not broader runtime execution.

The deployment boundary remains:

```text
Resource profile -> detect -> plan -> deployments.plan preview
Resource profile -> detect -> plan -> deployments.create execution
```

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Python planner contract | Family-specific planner contract covering Python evidence, packaging tool, ASGI/WSGI entrypoint, commands, artifact intent, port, health, and unsupported reasons. | Workload planning | Python catalog contract |
| ASGI app target | Importable module plus application object used by ASGI servers such as Uvicorn. | Python planning evidence | ASGI module/app |
| WSGI app target | Importable module plus application object used by WSGI servers such as Gunicorn or framework-native adapters. | Python planning evidence | WSGI module/app |
| Package tool evidence | Detected or explicit Python dependency tool that changes install and start command rendering. | Source inspection | package manager evidence |
| Planner key | Stable selected planner id such as `fastapi`, `django`, `flask`, `generic-asgi`, `generic-wsgi`, or `generic-python`. | Workload planning | selected planner |
| Explicit fallback command | User/resource-profile supplied install/build/start command that makes a Python source containerizable when framework evidence is missing or unsafe. | Resource runtime profile | custom command fallback |
| Unsupported reason | Stable blocked reason describing missing, ambiguous, or unsupported Python evidence and the fix path. | Deployment plan preview / errors | remediation reason |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| FPC-PY-SPEC-001 | Stable Python planner output | A supported Python fixture has package tool, framework or ASGI/WSGI evidence, command, network, and health evidence | Planner resolves it | Output includes planner key, support tier inputs, base image policy, install/build/start/package command specs, artifact kind, internal port behavior, health defaults, and safe diagnostics. |
| FPC-PY-SPEC-002 | FastAPI with `uv` | A FastAPI fixture has PEP 621 dependencies, `uv.lock`, and a deterministic ASGI target | Planner resolves it | Output uses `uv` install/run command specs, `fastapi` planner metadata, Python base image policy, workspace image artifact intent, and resource-owned internal port. |
| FPC-PY-SPEC-003 | Django and Flask with pip/requirements | Django or Flask fixtures have requirements evidence and deterministic WSGI/ASGI app targets | Planner resolves them | Output uses pip install command specs, framework planner metadata, deterministic start command, workspace image artifact intent, and resource-owned internal port. |
| FPC-PY-SPEC-004 | Generic ASGI/WSGI apps | A Python source has deterministic ASGI or WSGI module/app evidence but no named FastAPI/Django/Flask framework | Planner resolves it | Output selects `generic-asgi` or `generic-wsgi` instead of framework-specific behavior and still emits Docker/OCI image intent. |
| FPC-PY-SPEC-005 | Poetry project | A Python web fixture has Poetry metadata or `poetry.lock` | Planner resolves it | Output records Poetry tool evidence and renders install/start commands through Poetry without installing multiple Python toolchains. |
| FPC-PY-SPEC-006 | Explicit fallback command | A Python source lacks safe ASGI/WSGI discovery but resource runtime profile supplies explicit install/build/start commands | Planner resolves it | Output uses generic Python/custom command fallback, keeps commands in resource runtime profile, and does not add framework/base-image fields to `deployments.create`. |
| FPC-PY-SPEC-007 | Unsupported or missing Python evidence | Python evidence has ambiguous app targets, missing ASGI/WSGI app, missing production start, unsupported framework, or missing internal port | Plan preview or deployment planning runs | Appaloft returns structured blocked reasons or `validation_error` without guessing, and points users to resource runtime/network configuration or explicit fallback commands. |
| FPC-PY-SPEC-008 | Preview parity | Web, CLI, HTTP/oRPC, and future tool surfaces ask for a Python deployment plan | They call `deployments.plan` | They receive the same `deployments.plan/v1` shape and do not reimplement Python planner business logic. |

## Domain Ownership

- Bounded context: Release orchestration with workload-delivery planning input.
- Resource owns reusable source, runtime, network, health, and access profile fields.
- Deployment owns only admitted attempts and immutable snapshots after `deployments.create`.
- Runtime adapters own filesystem inspection, Python manifest parsing, ASGI/WSGI module discovery,
  generated Dockerfile assets, rendered shell, Docker/Compose/SSH details, and opt-in real smoke
  execution.
- `deployments.plan` is the read-only preview operation for the same `detect -> plan` contract.

## Public Surfaces

- API/oRPC: `deployments.plan` returns the stable preview shape for Python planner output.
- CLI: `appaloft deployments plan ...` renders the same evidence, artifact, command, network,
  health, warning, and unsupported reason data.
- Web/UI: Resource deployment preview uses the typed client result and does not hide Python planner
  rules in Svelte.
- Config/headless: repository config and CLI draft fields map to resource profile fields before
  ids-only deployment admission.
- Events: not applicable; this behavior adds no new deployment lifecycle events.
- Public docs/help: existing deployment plan preview and resource source/runtime anchors describe
  the preview and profile fix path; no new page is required unless output copy or help anchors
  change during Code Round.

## Non-Goals

- Do not add `deployments.retry`, `deployments.redeploy`, `deployments.rollback`,
  `deployments.cancel`, or manual health-check commands.
- Do not change `deployments.create` from ids-only admission.
- Do not add source, runtime, network, framework, package name, Python version, ASGI/WSGI target,
  base image, buildpack, provider SDK, Python runtime SDK, or framework package fields to
  `deployments.create`.
- Do not add non-Docker runtime substrate support.
- Do not execute Python package installers, framework CLIs, imports, or application code during
  admission-time detection.
- Do not claim every Python fixture has full real Docker/SSH smoke; headless Docker/OCI readiness
  remains the catalog closure layer, with representative opt-in Docker smoke tracked separately.

## Open Questions

- None. This Code Round promotes deterministic `generic-asgi` and `generic-wsgi` planner keys while
  keeping ambiguous or missing app targets blocked behind explicit fallback commands.
