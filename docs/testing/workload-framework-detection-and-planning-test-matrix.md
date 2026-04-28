# Workload Framework Detection And Planning Test Matrix

## Normative Contract

Tests for workload framework detection and planning must prove that source inspection produces typed
planning evidence, planner selection produces Docker/OCI-backed artifact intent, and entrypoints do
not add framework-specific deployment input fields.

The capability is internal. It is covered through planner/unit tests, deployment admission tests,
Quick Deploy workflow tests, and entrypoint contract tests rather than a public command test file.

Canonical assertions:

- package manager, framework, runtime family, project name, scripts, lockfiles, output paths, and
  runtime version are typed `SourceInspectionSnapshot` evidence when they affect planning;
- explicit `ResourceRuntimeProfile` strategy and command/profile fields win over inferred evidence;
- every selected v1 planner produces an OCI/Docker image artifact or Compose project intent;
- static, serverful HTTP, SSR, hybrid, worker, and container-native classifications determine
  artifact, port, and readiness behavior;
- base image and runtime command specs are planner output, not `deployments.create` input;
- runtime target/backend capabilities decide whether the selected plan can be applied to the
  selected target;
- Web, CLI, API, automation, and future MCP entrypoints converge on resource profile input plus
  ids-only deployment admission.

## Global References

This test matrix inherits:

- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-014: Deployment Admission Uses Resource Profile](../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [ADR-021: Docker/OCI Workload Substrate](../decisions/ADR-021-docker-oci-workload-substrate.md)
- [ADR-023: Runtime Orchestration Target Boundary](../decisions/ADR-023-runtime-orchestration-target-boundary.md)
- [Workload Framework Detection And Planning](../workflows/workload-framework-detection-and-planning.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [resources.create Command Spec](../commands/resources.create.md)
- [deployments.create Test Matrix](./deployments.create-test-matrix.md)
- [resources.create Test Matrix](./resources.create-test-matrix.md)
- [Quick Deploy Test Matrix](./quick-deploy-test-matrix.md)
- [Deployment Config File Test Matrix](./deployment-config-file-test-matrix.md)
- [Spec-Driven Testing](./SPEC_DRIVEN_TESTING.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Test Layers

| Layer | Framework-planning focus |
| --- | --- |
| Unit | Source inspection, package manager precedence, framework signal ranking, static/serverful/SSR classification, path normalization, base-image policy selection. |
| Integration | Planner registry selection, runtime plan resolution, deployment admission failure for unsupported/ambiguous evidence, target capability checks. |
| Contract | Command schemas reject framework/base-image/runtime preset fields; typed client/CLI serialization keeps `deployments.create` ids-only. |
| E2E | Web/CLI/HTTP or shell workflow deploys a supported framework source and observes deployment/read-model state through public surfaces. |

## Framework Fixture Contract

Framework fixture projects live under
`packages/adapters/filesystem/test/fixtures/frameworks/<fixture-name>`. They are deliberately small
source trees with pinned dependency versions, framework config files, and production scripts. The
fixture contract is source-inspection and planner integration only: tests must not install
dependencies, run framework CLIs, execute project scripts, or require network access.

All fixture manifests must use exact versions, not ranges. Node fixtures use exact `package.json`
versions and lockfile marker files. Python fixtures use exact `==` requirements or PEP 621
dependency strings plus lockfile marker files when a specific tool is being selected. Version
updates are behavior-affecting test-fixture changes and must update this table and the matching
test expectations in the same change.

| Fixture | Matrix rows | Fixed framework/tool versions | Expected detector result | Planner expectation |
| --- | --- | --- | --- | --- |
| `next-ssr` | `WF-PLAN-CAT-001` | `next 15.2.4`, `react 19.0.0`, `react-dom 19.0.0`, `pnpm` marker | `node`, `nextjs`, `pnpm`, `ssr`, App Router evidence | `nextjs`, workspace image, `next build`, `next start`, Next router/output metadata |
| `next-standalone` | `WF-PLAN-CAT-001` | `next 15.2.4`, `react 19.0.0`, `react-dom 19.0.0`, `pnpm` marker, `output: "standalone"` | `node`, `nextjs`, `pnpm`, `ssr`, standalone output evidence, Pages Router evidence | `nextjs`, workspace image, `next build`, `node .next/standalone/server.js`, Next router/output metadata |
| `next-static-export` | `WF-PLAN-CAT-002` | `next 15.2.4`, `react 19.0.0`, `react-dom 19.0.0`, `pnpm` marker | `node`, `nextjs`, `pnpm`, `static` from `output: "export"`, Pages Router evidence | `nextjs-static`, static image, publish `/out`, Next router/output metadata |
| `vite-spa` | `WF-PLAN-CAT-007` | `vite 5.4.11`, `@vitejs/plugin-react 4.3.4`, `react 18.3.1`, `bun` marker | `node`, `vite`, `bun`, `static` | `vite-static`, static image, publish `/dist` |
| `angular-spa` | `WF-PLAN-CAT-007` | `@angular/core 19.2.0`, `@angular/cli 19.2.0`, `@angular-devkit/build-angular 19.2.0`, `npm` marker | `node`, `angular`, `npm`, `static` | `angular-static`, static image, publish `/dist/angular-spa` from `angular.json` |
| `sveltekit-static` | `WF-PLAN-CAT-005` | `@sveltejs/kit 2.16.1`, `@sveltejs/adapter-static 3.0.8`, `svelte 5.19.7`, `vite 6.1.0`, `pnpm` marker | `node`, `sveltekit`, `pnpm`, `static` from `adapter-static` | `sveltekit-static`, static image, publish `/build` |
| `sveltekit-ambiguous` | `WF-PLAN-CAT-005` | `@sveltejs/kit 2.16.1`, `svelte 5.19.7`, `vite 6.1.0`, `pnpm` marker | `node`, `sveltekit`, `pnpm`, `hybrid-static-server` | `validation_error`, phase `runtime-plan-resolution` unless explicit strategy/start command is supplied |
| `nuxt-generate` | `WF-PLAN-CAT-004` | `nuxt 3.16.1`, `vue 3.5.13`, `pnpm` marker | `node`, `nuxt`, `pnpm`, `static` from `generate` script | `nuxt-static`, static image, publish `/.output/public` |
| `astro-static` | `WF-PLAN-CAT-006` | `astro 5.5.5`, `npm` marker | `node`, `astro`, `npm`, `static` | `astro-static`, static image, publish `/dist` |
| `remix-ssr` | `WF-PLAN-CAT-003` | `@remix-run/node 2.16.3`, `@remix-run/react 2.16.3`, `@remix-run/serve 2.16.3`, `react 18.3.1`, `npm` marker | `node`, `remix`, `npm`, `ssr` | `remix`, workspace image, build/start scripts |
| `express-server` | `WF-PLAN-CAT-008` | `express 4.21.2`, `npm` marker | `node`, `express`, `npm`, `serverful-http` | generic `node`, workspace image, build/start scripts |
| `fastify-server` | `WF-PLAN-CAT-008` | `fastify 5.2.1`, `typescript 5.8.2`, `pnpm` marker | `node`, `fastify`, `pnpm`, `serverful-http` | generic `node`, workspace image, build/start scripts |
| `nestjs-server` | `WF-PLAN-CAT-008` | `@nestjs/common 11.0.11`, `@nestjs/core 11.0.11`, `@nestjs/platform-express 11.0.11`, `reflect-metadata 0.2.2`, `rxjs 7.8.2`, `typescript 5.8.2`, `npm` marker | `node`, `nestjs`, `npm`, `serverful-http` | generic `node`, workspace image, build script plus `start:built` production start script |
| `hono-server` | `WF-PLAN-CAT-008` | `hono 4.7.5`, `bun` marker | `node`, `hono`, `bun`, `serverful-http` | generic `node`, Bun workspace image, build/start scripts |
| `koa-server` | `WF-PLAN-CAT-008` | `koa 2.16.0`, `yarn` marker | `node`, `koa`, `yarn`, `serverful-http` | generic `node`, workspace image, build/start scripts |
| `generic-node-server` | `WF-PLAN-CAT-008` | `npm` marker, production package scripts | `node`, no named framework, `npm`, `serverful-http` from non-dev start script evidence | generic `node`, workspace image, build script plus `start:built` production start script |
| `fastapi-uv` | `WF-PLAN-CAT-009` | `fastapi 0.115.8`, `uvicorn 0.34.0`, `uv` marker | `python`, `fastapi`, `uv`, `serverful-http` | `fastapi`, workspace image, uv install/start defaults |
| `django-pip` | `WF-PLAN-CAT-010` | `Django 5.1.7`, `pip` requirements | `python`, `django`, `pip`, `serverful-http` | `django`, workspace image, pip install/start default |
| `flask-pip` | `WF-PLAN-CAT-010` | `Flask 3.1.0`, `pip` requirements | `python`, `flask`, `pip`, `serverful-http` | `flask`, workspace image, pip install/start default |

## Detection Evidence Matrix

| Test ID | Preferred automation | Case | Given | Expected result | Expected error |
| --- | --- | --- | --- | --- | --- |
| WF-PLAN-DET-001 | unit | Node/Bun package manager precedence | `package.json`, multiple lockfiles, optional `packageManager` | Selected package manager follows explicit profile, then manifest, then lockfile precedence; ambiguity is recorded when no winner is safe | None unless the selected planner requires an unambiguous tool |
| WF-PLAN-DET-002 | unit | Python package tooling precedence | `pyproject.toml`, `uv.lock`, Poetry metadata, or `requirements.txt` | Selected tool is `uv`, Poetry, PEP 621/generic, or pip according to evidence precedence | None |
| WF-PLAN-DET-003 | unit | JVM build tool ambiguity | Source root has both Maven and Gradle runnable project evidence without explicit selection | Detection records ambiguity and planner selection requires explicit profile or source root | `validation_error`, phase `runtime-plan-resolution` when deployment admission cannot choose |
| WF-PLAN-DET-004 | unit | Framework signal ranking | Framework config, dependency, script, and output directory signals conflict | Config/source-root-specific signals beat dependencies; output directory alone cannot select a serverful framework | None or structured ambiguity warning |
| WF-PLAN-DET-005 | unit | No untrusted code execution during detection | Source has scripts that would reveal framework only after execution | Detector reads files only and does not run install/build/dev commands | Unsupported or missing evidence is explicit |
| WF-PLAN-DET-006 | unit | Package/project name is diagnostic | Source contains `package.json.name`, `pyproject.project.name`, or equivalent manifest name | Project name can seed display defaults and diagnostics, but never resource/deployment ids | None |
| WF-PLAN-DET-007 | unit | Application shape classification | Source evidence supports static, serverful, SSR, hybrid, worker, or container-native shape | Detection records the selected classification that drives artifact and network behavior | Ambiguous hybrid shape requires explicit strategy or adapter evidence |
| WF-PLAN-DET-008 | integration | Ambiguous multi-framework workspace | Selected source root contains multiple runnable apps and no base directory/profile selection | Planner refuses to guess across apps | `validation_error`, phase `runtime-plan-resolution` |
| WF-PLAN-DET-009 | integration | Explicit strategy overrides framework detection | Runtime profile is `dockerfile`, `docker-compose`, `prebuilt-image`, or `static` while framework evidence exists | Strategy-specific planner owns artifact construction; framework evidence is diagnostic only | None |
| WF-PLAN-DET-010 | unit | Framework port is only a hint | Framework default port is known but resource network profile has a different `internalPort` | Persisted `networkProfile.internalPort` wins and no deployment `port` field is produced | None |
| WF-PLAN-DET-011 | integration | Inbound app lacks port | Serverful/SSR source has no persisted port and no deterministic accepted inference | Deployment admission rejects before acceptance | `validation_error`, phase `resource-network-resolution` |
| WF-PLAN-DET-012 | integration | Unsupported framework without fallback | Source detects a framework/runtime family with no active planner and no explicit custom commands | Deployment admission rejects before acceptance with safe evidence details | `validation_error`, phase `runtime-plan-resolution` |
| WF-PLAN-DET-013 | unit | Next.js output/router evidence | `next.config.*`, `app`/`src/app`, `pages`/`src/pages`, and `output: "standalone"` or `output: "export"` evidence | Detection records output and App/Pages Router evidence for planner diagnostics without creating deployment command fields | Conflicting Next output evidence fails as ambiguous unless explicit custom commands select a Docker/OCI image plan |

## Planner Catalog Matrix

| Test ID | Preferred automation | Framework/app shape | Expected planner behavior |
| --- | --- | --- | --- |
| WF-PLAN-CAT-001 | integration | Next.js SSR/serverful | Detect Next evidence, selected package manager, App/Pages Router evidence, default server output, or standalone output; emit `workspace-commands` / `all-in-one-docker` image plans with Node/Bun base policy, install/build/start metadata, generated Dockerfile metadata, and HTTP runtime port from the resource network profile. Standalone output starts `.next/standalone/server.js` unless explicit custom commands override it. |
| WF-PLAN-CAT-002 | integration | Next static export | Detect explicit static/export mode and App/Pages Router evidence, emit `static-artifact` / `all-in-one-docker`, package `out` or explicit publish directory into the adapter-owned static-server image, record static server config metadata, and use default internal port 80 for first-deploy draft. |
| WF-PLAN-CAT-003 | integration | Remix | Detect Remix evidence, package server artifact and public assets, require supported server adapter start command or explicit start command. |
| WF-PLAN-CAT-004 | integration | Nuxt SSR and generate static | SSR packages `.output/server` with Nitro start; generate packages `.output/public` as static-server artifact. |
| WF-PLAN-CAT-005 | integration | SvelteKit static and server adapters | Adapter-static selects static output; server adapters require supported runtime entrypoint or explicit start command. |
| WF-PLAN-CAT-006 | integration | Astro static and SSR | Default static `dist` output uses static-server image; SSR adapter output uses serverful image and resource network port. |
| WF-PLAN-CAT-007 | integration | Vite/Angular/SPA static | Build script output such as `dist`, `build`, or Angular browser output packages into static-server image; preview/dev scripts are rejected as production start. |
| WF-PLAN-CAT-008 | integration | Express/Fastify/NestJS/Hono/Koa/generic Node | Requires production start script or deterministic framework start; packages Docker/OCI image with selected Node/Bun base policy. |
| WF-PLAN-CAT-009 | integration | FastAPI | Detect FastAPI and Python tooling; derive `uvicorn` start only when ASGI module/app evidence is safe, otherwise require explicit start. |
| WF-PLAN-CAT-010 | integration | Django and Flask | Detect framework-specific files and dependencies; derive WSGI/ASGI/Gunicorn start only when project module/app object is known. |
| WF-PLAN-CAT-011 | integration | Rails, Sinatra/Rack, Laravel, Symfony, generic PHP | Detect Bundler or Composer tooling; package Docker/OCI image with framework runtime profile and HTTP endpoint owned by resource network profile. |
| WF-PLAN-CAT-012 | integration | Go HTTP services | Build selected module/package to binary in multi-stage image and run binary with explicit or safely inferred port. |
| WF-PLAN-CAT-013 | integration | Spring Boot, Quarkus, Micronaut, generic JVM | Select Maven or Gradle, build jar/native artifact, package runtime image, and start known artifact. |
| WF-PLAN-CAT-014 | integration | ASP.NET Core | Select project and SDK version, publish app, package .NET runtime image, and run published assembly. |
| WF-PLAN-CAT-015 | integration | Phoenix, Axum, Actix Web, Rocket | Build release/binary, package runtime image, and require resource network port unless deterministic profile evidence supplies it. |
| WF-PLAN-CAT-016 | integration | Dockerfile, Docker Compose, prebuilt image | Explicit container-native strategy bypasses framework artifact inference while preserving diagnostics and resource network/health rules. |

## Boundary Matrix

| Test ID | Preferred automation | Case | Expected result |
| --- | --- | --- | --- |
| WF-PLAN-BOUND-001 | contract | Deployment command rejects framework fields | `deployments.create` rejects `framework`, `packageName`, `baseImage`, `runtimePreset`, `buildpack`, and language-version fields at schema/API boundary. |
| WF-PLAN-BOUND-002 | integration | Base image is planner output | Runtime plan metadata records selected base-image policy from typed evidence; command input and resource identity do not contain ad-hoc base image strings. |
| WF-PLAN-BOUND-003 | integration | Runtime command specs are typed | Planner emits typed install/build/start/package specs or shell-script leaves; adapter-rendered shell appears only at execution/display boundary. |
| WF-PLAN-BOUND-004 | integration | Target capability mismatch | A valid workload plan on a target without required image build, Compose, verify, logs, or health capability fails as `runtime_target_unsupported` before acceptance when safe. |
| WF-PLAN-BOUND-005 | contract | Core stays provider/framework independent | Core value objects use stable platform vocabulary and do not import framework package types, Docker SDK response types, provider SDK types, filesystem readers, or shell executors. |
| WF-PLAN-BOUND-006 | integration | Sanitized diagnostics only | Planner and runtime failure details include safe evidence fields and omit secrets, registry tokens, raw env values, and unbounded command output. |

## Entry Parity Matrix

| Test ID | Preferred automation | Entry | Expected test focus |
| --- | --- | --- | --- |
| WF-PLAN-ENTRY-001 | e2e-preferred | Web Quick Deploy | Web source inspection may suggest resource name, strategy, commands, publish directory, and internal port, then dispatches `resources.create` plus ids-only `deployments.create`. |
| WF-PLAN-ENTRY-002 | e2e-preferred | CLI Quick Deploy | CLI uses the same inspection/planner contract as Web, prompts or errors for missing fallback commands, and never sends framework/base-image fields to `deployments.create`. |
| WF-PLAN-ENTRY-003 | contract | HTTP/oRPC strict deployment admission | HTTP/oRPC deployment create accepts only the shared ids-only command schema and does not read local source files or repository config files. |
| WF-PLAN-ENTRY-004 | e2e-preferred | Repository config / headless profile | Config profile fields map to resource source/runtime/network/health operations before deployment; unsupported framework/runtime sizing/orchestrator fields are rejected before mutation. |

## Current Implementation Notes And Migration Gaps

Current executable coverage is spread across deployment, resource, Quick Deploy, runtime planner,
CLI, Web, and shell e2e tests. This matrix is the source of truth for the broader framework support
catalog.

Implemented planner code paths currently include Next.js, Vite static, Astro static, Nuxt generate
static, explicit SvelteKit static, Remix, FastAPI, Django, Flask, generic Node, generic Python,
generic Java, and custom command fallback. Executable matrix coverage exists for the named fixtures
and focused planner tests listed below; generic Java still lacks a matrix-named fixture or focused
planner test and remains a coverage gap until one is added.

Executable coverage now includes first-slice `applicationShape` propagation for
`WF-PLAN-DET-007`, Node manifest package-manager precedence coverage for `WF-PLAN-DET-001`, and
container-native override coverage for `WF-PLAN-DET-009`/`WF-PLAN-CAT-016`. Catalog tests named
with `WF-PLAN-CAT-001`, `WF-PLAN-CAT-002`, `WF-PLAN-CAT-003`, `WF-PLAN-CAT-005`,
`WF-PLAN-CAT-007`, `WF-PLAN-CAT-008`, `WF-PLAN-CAT-009`, and `WF-PLAN-CAT-010` prove the selected
planner records `static`, `serverful-http`, `hybrid-static-server`, or `ssr` classification metadata
where covered. `WF-PLAN-DET-013` binds Next.js output/router evidence to planner metadata without
adding framework-specific deployment command fields.
Fixed-version framework fixture tests now cover detector evidence for the table above, enforce exact
manifest/requirements versions, and feed supported fixtures through runtime planning without
installing dependencies or executing framework CLIs. Planner fixture coverage includes Next.js SSR,
Next.js standalone output, Next.js static export, Vite, SvelteKit adapter-static, Nuxt generate,
Astro static, Remix, Express, Fastify, NestJS, Hono, Koa, generic Node package scripts, FastAPI,
Django, and Flask, including Angular `angular.json` output-path planning.
`WF-PLAN-BOUND-001` has command-schema coverage for rejecting framework/package/base-image/buildpack
deployment fields. This does not yet complete unsupported catalog families, SvelteKit server-adapter
start inference, Astro SSR, worker plans, or Web/CLI entry parity.

Before a framework family can be marked first-class, Code Round must add at least one planner or
fallback test for its `WF-PLAN-CAT-*` row plus boundary coverage proving base-image policy,
artifact output, network/readiness behavior, and absence of deployment command fields.

## Open Questions

- Which unsupported catalog families should be implemented first after the current JavaScript,
  Python, Java, static, and custom-command slices?
