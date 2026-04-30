# Framework Planner Contract And JavaScript/TypeScript Tested Catalog

## Status

- Round: Spec Round -> Test-First Round -> Code Round
- Artifact state: current behavior hardening; JavaScript/TypeScript catalog closure in progress
- Roadmap target: Phase 5 First-Deploy Engine And Framework Breadth (`0.7.0` gate)
- Compatibility impact: `pre-1.0-policy`; hardens public preview output and planner diagnostics without adding deployment admission fields

## Business Outcome

Operators can see a stable, explainable workload plan before deployment for mainstream JavaScript
and TypeScript applications. The same planner contract becomes the reusable pattern for later
Python, JVM, Go, Ruby, PHP, .NET, Rust, and other framework families.

The outcome is catalog confidence, not broader runtime execution. Appaloft keeps the current
deployment boundary:

```text
Resource profile -> detect -> plan -> deployments.plan preview
Resource profile -> detect -> plan -> deployments.create execution
```

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Framework planner contract | Stable planner input/output contract covering evidence, support tier, commands, artifact intent, network, health, and unsupported reasons. | Workload planning | planner contract |
| Tested catalog | Framework fixture set with stable matrix ids and executable tests proving detection and Docker/OCI planning output. | Test matrix / runtime adapter | supported fixture catalog |
| Planner key | Stable selected planner id such as `nextjs`, `nextjs-static`, `vite-static`, `remix`, or `node`. | Workload planning | selected planner |
| Support tier | User-visible support classification returned by `deployments.plan` and planner diagnostics. | Deployment plan preview | planner support |
| Package manager evidence | Detected or explicit tool choice that changes install/build/start/package commands. | Source inspection | build tool evidence |
| Artifact intent | Docker/OCI-backed output such as workspace image, static-server image, Dockerfile image, Compose project, or prebuilt image. | Runtime planning | planned artifact |
| Internal port requirement | Resource-owned listener port rule for serverful/SSR plans; static plans default to port 80. | Resource network profile | runtime port |
| Unsupported reason | Stable blocked reason describing missing, ambiguous, or unsupported evidence and the fix path. | Deployment plan preview / errors | remediation reason |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| FPC-JS-SPEC-001 | Stable planner output | A supported JS/TS fixture has framework, package-manager, command, output, and network evidence | Planner resolves it | Output includes planner key, support tier inputs, base image policy, install/build/start/package command specs, artifact kind, internal port behavior, health defaults, and safe diagnostics. |
| FPC-JS-SPEC-002 | Static catalog fixtures | Next static export, Nuxt generate, SvelteKit static, Astro static, Vite, React, Vue, Svelte, Solid, or Angular fixture is selected | Planner resolves it | Output is a static-server image plan with deterministic publish directory and default internal port 80 unless the resource profile overrides it. |
| FPC-JS-SPEC-003 | Serverful and SSR catalog fixtures | Next SSR/standalone, Remix, Express, Fastify, NestJS, Hono, Koa, or generic package scripts are selected | Planner resolves it | Output is a Docker/OCI workspace image plan with production start evidence and resource-owned internal port. |
| FPC-JS-SPEC-004 | Unsupported or ambiguous evidence | A fixture has ambiguous hybrid mode, missing production start, missing static output, unsupported framework, or missing internal port | Plan preview or deployment planning runs | Appaloft returns structured blocked reasons or `validation_error` without guessing, and points users to resource runtime/network configuration or explicit custom commands. |
| FPC-JS-SPEC-005 | Preview parity | Web, CLI, HTTP/oRPC, and future tool surfaces ask for a deployment plan | They call `deployments.plan` | They receive the same `deployments.plan/v1` shape and do not reimplement planner business logic. |

## Domain Ownership

- Bounded context: Release orchestration with workload-delivery planning input.
- Resource owns reusable source, runtime, network, health, and access profile fields.
- Deployment owns only admitted attempts and immutable snapshots after `deployments.create`.
- Runtime adapters own filesystem inspection, generated Dockerfile/static-server assets, rendered shell, Docker/Compose/SSH details, and opt-in real smoke execution.
- `deployments.plan` is the read-only preview operation for the same `detect -> plan` contract.

## Public Surfaces

- API/oRPC: `deployments.plan` returns the stable preview shape.
- CLI: `appaloft deployments plan ...` renders the same evidence, artifact, command, network, health, warning, and unsupported reason data.
- Web/UI: Resource deployment preview uses the typed client result and does not hide planner rules in Svelte.
- Config/headless: repository config and CLI draft fields map to resource profile fields before ids-only deployment admission.
- Events: not applicable; this behavior adds no new deployment lifecycle events.
- Public docs/help: existing deployment lifecycle/source-runtime anchors describe plan preview and profile fixes; no new public page is required.

## Non-Goals

- Do not add `deployments.retry`, `deployments.redeploy`, `deployments.rollback`, `deployments.cancel`, or manual health-check commands.
- Do not change `deployments.create` from ids-only admission.
- Do not add source, runtime, network, framework, package name, base image, buildpack, or provider SDK fields to `deployments.create`.
- Do not add non-Docker runtime substrate support.
- Do not execute framework CLIs during admission-time detection.
- Do not claim every JS/TS fixture has full real Docker/SSH smoke; headless Docker/OCI readiness remains the catalog closure level, with representative opt-in Docker smoke tracked separately.

## Open Questions

- Which non-JavaScript family should be promoted next after this catalog closure: Python hardening, Spring Boot, Go, Ruby/PHP, .NET, or Rust?
