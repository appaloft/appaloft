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
| `next-ssr` | `WF-PLAN-CAT-001` | `next 15.2.4`, `react 19.0.0`, `react-dom 19.0.0`, `typescript 5.8.2`, `pnpm` marker | `node`, `nextjs`, `pnpm`, `ssr`, App Router evidence | `nextjs`, workspace image, `next build`, `next start`, Next router/output metadata |
| `next-standalone` | `WF-PLAN-CAT-001` | `next 15.2.4`, `react 19.0.0`, `react-dom 19.0.0`, `pnpm` marker, `output: "standalone"` | `node`, `nextjs`, `pnpm`, `ssr`, standalone output evidence, Pages Router evidence | `nextjs`, workspace image, `next build`, `node .next/standalone/server.js`, Next router/output metadata |
| `next-static-export` | `WF-PLAN-CAT-002` | `next 15.2.4`, `react 19.0.0`, `react-dom 19.0.0`, `pnpm` marker | `node`, `nextjs`, `pnpm`, `static` from `output: "export"`, Pages Router evidence | `nextjs-static`, static image, publish `/out`, Next router/output metadata |
| `vite-spa` | `WF-PLAN-CAT-007` | `vite 5.4.11`, `bun` marker | `node`, `vite`, `bun`, `static` | `vite-static`, static image, publish `/dist` |
| `react-spa` | `WF-PLAN-CAT-007` | `react 18.3.1`, `react-dom 18.3.1`, `react-scripts 5.0.1`, `npm` marker | `node`, `react`, `npm`, `static` | `react-static`, static image, publish `/build` |
| `vue-spa` | `WF-PLAN-CAT-007` | `vue 3.5.13`, `@vue/cli-service 5.0.8`, `pnpm` marker | `node`, `vue`, `pnpm`, `static` | `vue-static`, static image, publish `/dist` |
| `svelte-spa` | `WF-PLAN-CAT-007` | `svelte 5.19.7`, `@rollup/plugin-svelte 7.2.2`, `rollup 4.34.8`, `yarn` marker | `node`, `svelte`, `yarn`, `static` | `svelte-static`, static image, publish `/public` |
| `solid-spa` | `WF-PLAN-CAT-007` | `solid-js 1.9.5`, `vite 6.1.0`, `vite-plugin-solid 2.11.2`, `bun` marker | `node`, `solid`, `bun`, `static` | `solid-static`, static image, publish `/dist` |
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
| `generic-asgi-uv` | `WF-PLAN-PY-004` | `uvicorn 0.34.0`, `uv` marker | `python`, generic ASGI evidence, `uv`, `serverful-http` | `generic-asgi` or generic `python`, workspace image, deterministic ASGI start default |
| `generic-wsgi-pip` | `WF-PLAN-PY-005` | `gunicorn 23.0.0`, pip requirements | `python`, generic WSGI evidence, `pip`, `serverful-http` | `generic-wsgi` or generic `python`, workspace image, deterministic WSGI start default |
| `python-poetry-web` | `WF-PLAN-PY-006` | Poetry metadata/lock marker plus supported web evidence | `python`, detected framework or ASGI/WSGI evidence, `poetry`, `serverful-http` | workspace image, Poetry install/start commands |
| `python-explicit-start` | `WF-PLAN-PY-007` | Python package evidence plus explicit resource runtime start command | `python`, no unsafe framework selection required, selected package tool, `serverful-http` | generic `python` or custom fallback workspace image using explicit commands |
| `spring-boot-maven-wrapper` | `WF-PLAN-JVM-001` | Spring Boot `3.4.4`, Maven wrapper marker, `.java-version` 21 | `java`, `spring-boot`, `maven`, `serverful-http`, `maven-wrapper`, Spring Boot dependency/plugin evidence | `spring-boot`, workspace image, `./mvnw package -DskipTests`, deterministic `java -jar` start, Java base image from `.java-version` |
| `spring-boot-maven` | `WF-PLAN-JVM-002` | Spring Boot `3.4.4`, Maven project without wrapper | `java`, `spring-boot`, `maven`, `serverful-http`, `pom.xml`, Spring Boot dependency/plugin evidence | `spring-boot`, workspace image, `mvn package -DskipTests`, deterministic `java -jar` start |
| `spring-boot-gradle-wrapper` | `WF-PLAN-JVM-003` | Spring Boot `3.4.4`, Gradle wrapper marker, Groovy DSL | `java`, `spring-boot`, `gradle`, `serverful-http`, `gradle-wrapper`, Spring Boot plugin/dependency evidence | `spring-boot`, workspace image, `./gradlew bootJar -x test`, deterministic `java -jar` start from `build/libs` |
| `spring-boot-gradle-kts` | `WF-PLAN-JVM-004` | Spring Boot `3.4.4`, Gradle wrapper marker, Kotlin DSL | `java`, `spring-boot`, `gradle`, `serverful-http`, `gradle-wrapper`, `build.gradle.kts`, Spring Boot plugin/dependency evidence | `spring-boot`, workspace image, `./gradlew bootJar -x test`, deterministic `java -jar` start from `build/libs` |
| `jvm-explicit-start` | `WF-PLAN-JVM-005` | JVM project evidence plus explicit resource runtime start command | `java`, selected build tool or generic JVM evidence, `serverful-http` | generic JVM/custom fallback workspace image using explicit commands |
| `generic-java-jar` | `WF-PLAN-JVM-006` | Generic Java/JVM project with exactly one deterministic runnable jar evidence item | `java`, no named framework, selected build tool or jar evidence, `serverful-http` | generic JVM planner, workspace image, deterministic `java -jar` start |

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

## JavaScript/TypeScript Tested Catalog Closure Matrix

These rows close the Phase 5 JavaScript/TypeScript tested catalog at the headless Docker/OCI
readiness layer. They do not claim full fixture-by-fixture real Docker or SSH execution; those
remain tracked by `WF-PLAN-SMOKE-005` and `WF-PLAN-SMOKE-006`.

| Test ID | Preferred automation | Case | Expected result |
| --- | --- | --- | --- |
| WF-PLAN-JS-001 | integration | Next.js SSR | `next-ssr` records Next/App Router evidence, `pnpm`, `ssr`, `nextjs`, Node base image policy, install/build/start commands, workspace image artifact, and resource-owned port 3000. |
| WF-PLAN-JS-002 | integration | Next.js standalone | `next-standalone` records standalone output evidence, Pages Router evidence, deterministic `node .next/standalone/server.js` start, workspace image artifact, and resource-owned port 3000. |
| WF-PLAN-JS-003 | integration | Next.js static export | `next-static-export` records export output evidence, `nextjs-static`, publish `/out`, static-server image artifact, and default internal port 80. |
| WF-PLAN-JS-004 | integration | Remix server | `remix-ssr` records Remix evidence, package manager, build/start scripts, `remix` planner, workspace image artifact, and resource-owned port. |
| WF-PLAN-JS-005 | integration | Nuxt generate static | `nuxt-generate` records generate/static evidence, `.output/public`, `nuxt-static`, static-server image artifact, and default internal port 80. |
| WF-PLAN-JS-006 | integration | SvelteKit static | `sveltekit-static` records adapter-static evidence, publish `/build`, `sveltekit-static`, static-server image artifact, and default internal port 80. |
| WF-PLAN-JS-007 | integration | SvelteKit ambiguous server/static mode | `sveltekit-ambiguous` records `hybrid-static-server` evidence and rejects auto planning with `validation_error` in `runtime-plan-resolution` unless explicit static strategy or start command is supplied. |
| WF-PLAN-JS-008 | integration | Astro static | `astro-static` records Astro static evidence, publish `/dist`, `astro-static`, static-server image artifact, and default internal port 80. |
| WF-PLAN-JS-009 | integration | Vite/React/Vue/Svelte/Solid/Angular static SPA | SPA fixtures record framework-specific static evidence, package manager, publish output, planner key, static-server image artifact, and default internal port 80. |
| WF-PLAN-JS-010 | integration | Express/Fastify/NestJS/Hono/Koa | Node HTTP fixtures record framework metadata, package manager/base image policy, build/start command specs, generic `node` workspace image planner, and resource-owned internal port. |
| WF-PLAN-JS-011 | integration | Generic package scripts | `generic-node-server` uses production package scripts with generic `node` planner, workspace image artifact, and no named framework field. |
| WF-PLAN-JS-012 | integration | Missing production start command or static output | JS/TS evidence without safe production start or static output is rejected with `validation_error` in `runtime-plan-resolution`; explicit custom commands may produce a containerizable image plan. |
| WF-PLAN-JS-013 | integration | Internal port behavior | Static JS/TS planners default to port 80; serverful/SSR planners use the resource network profile port and do not add deployment-owned `port` input. |

## Python Tested Catalog Closure Matrix

These rows close the Phase 5 Python tested catalog at the headless Docker/OCI readiness layer. They
do not claim full fixture-by-fixture real Docker or SSH execution; those remain tracked by
`WF-PLAN-SMOKE-005` and `WF-PLAN-SMOKE-006`.

| Test ID | Preferred automation | Case | Expected result |
| --- | --- | --- | --- |
| WF-PLAN-PY-001 | integration | FastAPI with `uv` | `fastapi-uv` records FastAPI dependency, `uv` package tool evidence, ASGI app target evidence, `fastapi` planner metadata, Python base image policy, install/start command specs, workspace image artifact, and resource-owned internal port. |
| WF-PLAN-PY-002 | integration | Django with pip/requirements | `django-pip` records Django dependency, `manage.py`, WSGI/ASGI module evidence when present, pip/requirements install command, `django` planner metadata, workspace image artifact, and resource-owned internal port. |
| WF-PLAN-PY-003 | integration | Flask with pip/requirements | `flask-pip` records Flask dependency, app module evidence when present, pip/requirements install command, `flask` planner metadata, workspace image artifact, and resource-owned internal port. |
| WF-PLAN-PY-004 | integration | Generic deterministic ASGI app | A generic ASGI fixture records Python package tool evidence plus one safe ASGI `module:app` target, selects a generic ASGI/Python planner path, emits Uvicorn start command specs, and avoids framework-specific deployment fields. |
| WF-PLAN-PY-005 | integration | Generic deterministic WSGI app | A generic WSGI fixture records Python package tool evidence plus one safe WSGI `module:app` target, selects a generic WSGI/Python planner path, emits Gunicorn or equivalent WSGI start command specs, and avoids framework-specific deployment fields. |
| WF-PLAN-PY-006 | integration | Poetry project | Poetry metadata or `poetry.lock` selects Poetry install/start command rendering without also selecting pip/uv installs unless explicitly owned by the planner. |
| WF-PLAN-PY-007 | integration | Explicit start-command fallback | Python source with missing or unsupported framework evidence plans only when explicit resource runtime profile install/build/start commands make a Docker/OCI image plan possible. |
| WF-PLAN-PY-008 | unit/integration | Python package tool precedence | Explicit tool wins, then `uv.lock`, Poetry metadata/`poetry.lock`, PEP 621 `pyproject.toml`, `requirements.txt`, and generic pip fallback; conflicting evidence is diagnostic unless a selected planner requires one unambiguous tool. |
| WF-PLAN-PY-009 | integration | Missing ASGI/WSGI app target | FastAPI, Django, Flask, generic ASGI, or generic WSGI evidence without a deterministic app target is blocked with `missing-asgi-app`, `missing-wsgi-app`, or `missing-python-app-target` before deployment execution unless explicit start command is supplied. |
| WF-PLAN-PY-010 | integration | Ambiguous ASGI/WSGI app targets | Multiple plausible Python web app targets are blocked with `ambiguous-python-app-target` unless source base directory, app target, or explicit start command resolves the ambiguity. |
| WF-PLAN-PY-011 | integration | Missing production start command | Generic Python evidence without safe ASGI/WSGI target and without explicit start command is rejected with `validation_error` in `runtime-plan-resolution`; explicit fallback commands may produce a containerizable image plan. |
| WF-PLAN-PY-012 | integration | Internal port behavior | Python serverful planners use the resource network profile port and do not add deployment-owned `port` input; missing required port is blocked in `resource-network-resolution` when no deterministic persisted profile value exists. |
| WF-PLAN-PY-013 | contract/integration | Preview parity | `deployments.plan/v1` exposes ready and blocked Python planner output with source evidence, planner key/support tier, artifact kind, command specs, network, health, warnings, unsupported reasons, and next actions without creating a deployment attempt. |

## JVM Tested Catalog Closure Matrix

These rows close the Phase 5 JVM/Spring Boot tested catalog at the headless Docker/OCI readiness
layer. They do not claim full fixture-by-fixture real Docker or SSH execution; those remain tracked
by `WF-PLAN-SMOKE-005` and `WF-PLAN-SMOKE-006`.

| Test ID | Preferred automation | Case | Expected result |
| --- | --- | --- | --- |
| WF-PLAN-JVM-001 | integration | Spring Boot Maven project with `mvnw` | `spring-boot-maven-wrapper` records Spring Boot Maven dependency/plugin evidence, Maven wrapper evidence, Java version, `spring-boot` planner metadata, Java base image policy, package/start command specs, workspace image artifact, and resource-owned internal port. |
| WF-PLAN-JVM-002 | integration | Spring Boot Maven project without wrapper | `spring-boot-maven` records Spring Boot Maven evidence and uses system Maven command rendering without requiring wrapper files. |
| WF-PLAN-JVM-003 | integration | Spring Boot Gradle project with `gradlew` | `spring-boot-gradle-wrapper` records Gradle wrapper and Spring Boot plugin/dependency evidence, emits Gradle `bootJar` command specs, and starts the deterministic jar from `build/libs`. |
| WF-PLAN-JVM-004 | integration | Spring Boot Gradle Kotlin DSL project | `spring-boot-gradle-kts` records Kotlin DSL Gradle evidence and uses the same Spring Boot planner contract as Groovy DSL Gradle projects. |
| WF-PLAN-JVM-005 | integration | Generic JVM explicit start-command fallback | JVM source with missing or unsupported framework evidence plans only when explicit resource runtime profile install/build/start commands make a Docker/OCI image plan possible. |
| WF-PLAN-JVM-006 | integration | Generic deterministic runnable jar fallback | Generic JVM source with one deterministic runnable jar evidence item selects a generic JVM planner path, emits `java -jar` start command specs, and avoids framework-specific deployment fields. |
| WF-PLAN-JVM-007 | unit/integration | JVM build tool precedence | Explicit tool selection wins when supported; otherwise Maven wrapper/Maven and Gradle wrapper/Gradle evidence select their owning tool. Maven/Gradle ambiguity is diagnostic or blocked when no source root/profile selection resolves it. |
| WF-PLAN-JVM-008 | integration | Runnable jar discovery | Spring Boot and generic JVM planners emit `java -jar` only when jar path selection is deterministic from explicit profile, artifact naming, or exactly one safe jar evidence item. |
| WF-PLAN-JVM-009 | integration | Spring Boot actuator health evidence | Spring Boot fixtures with actuator dependency may default health to an actuator endpoint; non-actuator Spring Boot fixtures use the generic HTTP default unless resource health policy wins. |
| WF-PLAN-JVM-010 | integration | Unsupported JVM framework without fallback | Quarkus, Micronaut, or another unsupported JVM framework is blocked with `unsupported-framework` unless explicit fallback commands produce a containerizable image plan. |
| WF-PLAN-JVM-011 | integration | Ambiguous Maven/Gradle evidence | Source root with both Maven and Gradle runnable project evidence and no explicit selection is blocked with `ambiguous-jvm-build-tool`. |
| WF-PLAN-JVM-012 | integration | Missing runnable jar or production start command | JVM evidence without deterministic jar path and without explicit start command is rejected with `missing-runnable-jar` or `missing-production-start-command` in `runtime-plan-resolution`. |
| WF-PLAN-JVM-013 | integration | Missing JVM build tool evidence | Generic JVM source without Maven, Gradle, jar, or explicit command evidence is rejected with `missing-jvm-build-tool` or `unsupported-framework` in `runtime-plan-resolution`. |
| WF-PLAN-JVM-014 | integration | Internal port behavior | JVM serverful planners use the resource network profile port and do not add deployment-owned `port` input; missing required port is blocked in `resource-network-resolution` when no deterministic persisted profile value exists. |
| WF-PLAN-JVM-015 | contract/integration | Preview parity | `deployments.plan/v1` exposes ready and blocked JVM planner output with source evidence, build tool, planner key/support tier, artifact kind, command specs, network, health, warnings, unsupported reasons, and next actions without creating a deployment attempt. |

## Buildpack Accelerator Contract Matrix

These rows govern the buildpack-style detection accelerator contract. They do not claim real
`pack`/lifecycle execution; hermetic fake adapter evidence is sufficient until a later adapter
Code Round governs execution.

| Test ID | Preferred automation | Case | Expected result |
| --- | --- | --- | --- |
| WF-PLAN-BP-001 | contract/integration | Explicit planner wins | Source has first-class planner evidence and buildpack-detectable files | Explicit planner remains selected with support tier `first-class`; buildpack evidence is non-winning diagnostic evidence and no planner output is replaced. |
| WF-PLAN-BP-002 | contract/integration | Explicit custom/container-native profile wins | Resource selects Dockerfile, Compose, prebuilt image, static, or explicit custom commands while buildpack evidence exists | Explicit profile owns artifact construction; buildpack evidence cannot override the strategy or generate deployment input. |
| WF-PLAN-BP-003 | contract/integration | Unknown buildpack-detectable source | Source has safe buildpack evidence but no first-class planner or explicit custom/container-native profile | Preview reports `buildpack-accelerated`, Docker/OCI image intent, builder policy, detected buildpacks, limitations, and next actions without creating a deployment attempt. |
| WF-PLAN-BP-004 | contract/integration | Buildpack disabled or unavailable target | Buildpack acceleration is disabled or selected runtime target lacks required build/lifecycle capability | Preview is blocked with `buildpack-disabled` or `buildpack-target-unavailable` and remediation points to explicit runtime/profile fixes. |
| WF-PLAN-BP-005 | contract/integration | Unsupported builder or lifecycle feature | Buildpack evidence selects a builder, run image, or lifecycle feature outside Appaloft policy | Preview is blocked with `unsupported-buildpack-builder` or `unsupported-buildpack-lifecycle-feature`; unsupported builder values stay adapter diagnostics, not command input. |
| WF-PLAN-BP-006 | contract/integration | Ambiguous buildpack evidence | Multiple language families, framework hints, or buildpacks conflict without explicit override | Preview is blocked or `requires-override` with `ambiguous-buildpack-evidence`; Appaloft does not guess. |
| WF-PLAN-BP-007 | integration | Missing internal port | Buildpack candidate describes an inbound HTTP app but `ResourceNetworkProfile.internalPort` is absent | Planning is blocked in `resource-network-resolution` with `internal-port-missing`; buildpack port hints do not become source of truth. |
| WF-PLAN-BP-008 | integration | Explicit runtime/build/start override precedence | Resource runtime profile supplies explicit install/build/start commands for a buildpack-detectable unknown source | Explicit custom/generic planning wins and buildpack candidate does not replace commands. |
| WF-PLAN-BP-009 | contract/integration | Environment and variable boundary | Buildpack candidate needs build/runtime variables, including secret-bearing values and build-time/public values | Preview masks secrets, preserves build-time `PUBLIC_`/`VITE_` rules, and never creates deployment-owned environment overrides. |
| WF-PLAN-BP-010 | contract / future | MCP/tool metadata parity | Future tool descriptor exposes deployment planning | Tool metadata maps to `deployments.plan` and preserves buildpack evidence, tier, limitation, reason-code, and next-action shape. |

## Runtime Plan Resolution Failure Matrix

These rows govern the shared unsupported/override contract used by current JavaScript/TypeScript,
Python, JVM/buildpack preview rows and future Go, Ruby, PHP, .NET, Rust, and Elixir planner rows.
Test names must include the matrix id they prove.

| Test ID | Preferred automation | Case | Expected result |
| --- | --- | --- | --- |
| WF-PLAN-FAIL-001 | contract/integration | Unsupported framework | A source detects a framework with no first-class planner and no explicit fallback commands | Planning is blocked before execution with support tier `unsupported`, reason `unsupported-framework`, safe evidence, fix path, override path, and phase `runtime-plan-resolution`. |
| WF-PLAN-FAIL-002 | contract/integration | Unsupported runtime family | A source detects a runtime family with no active Appaloft planner path | Planning is blocked with `unsupported-runtime-family` and points to explicit custom commands, Dockerfile, Compose, or prebuilt image profile. |
| WF-PLAN-FAIL-003 | contract/integration | Ambiguous framework evidence | Multiple frameworks or runnable apps are detected under the selected source root | Planning is blocked or requires override with `ambiguous-framework-evidence`, affected field `source.baseDirectory` or a runtime strategy/profile field, and no guessed planner. |
| WF-PLAN-FAIL-004 | contract/integration | Ambiguous build tool | Maven/Gradle, npm/pnpm/yarn/bun, or another runtime-family build-tool choice is ambiguous | Planning is blocked with `ambiguous-build-tool` and a fix/override path that selects source root or explicit build tool/profile. |
| WF-PLAN-FAIL-005 | contract/integration | Missing build tool | Runtime family evidence exists but no supported build tool/package manager/artifact evidence exists | Planning is blocked with `missing-build-tool`, safe file evidence, and a resource runtime/profile fix path. |
| WF-PLAN-FAIL-006 | contract/integration | Missing start or build intent repaired by explicit command | Source evidence lacks safe production start/build intent | Planning blocks with `missing-start-intent` or `missing-build-intent`; when explicit runtime commands are supplied, support tier becomes `explicit-custom` and inferred commands do not win. |
| WF-PLAN-FAIL-007 | integration | Missing internal port for serverful HTTP/SSR | Serverful HTTP or SSR shape has no persisted or deterministic resource network port | Planning is blocked with `missing-internal-port` in `resource-network-resolution`; no deployment-owned port field is produced. |
| WF-PLAN-FAIL-008 | integration | Static shape default port | Static shape has deterministic output or explicit publish directory | Planning uses Appaloft static-server internal port `80` and does not require user port input. |
| WF-PLAN-FAIL-009 | contract/integration | Missing source root/base directory | Source-root evidence is ambiguous or the requested base directory cannot be resolved safely | Planning is blocked with `missing-source-root` and points to `source.baseDirectory`. |
| WF-PLAN-FAIL-010 | contract/integration | Missing artifact output | Static, jar, binary, publish, or packaged artifact output cannot be selected | Planning is blocked with `missing-artifact-output` and points to publish directory, artifact output, or explicit commands. |
| WF-PLAN-FAIL-011 | contract/integration | Unsupported runtime target | Workload plan requires a backend capability the selected runtime target lacks | Planning blocks before execution with `unsupported-runtime-target` or command admission fails with `runtime_target_unsupported` in `runtime-target-resolution`. |
| WF-PLAN-FAIL-012 | contract/integration | Unsupported container-native profile | Dockerfile, Compose, or prebuilt image profile is explicit but unsupported, inconsistent, or missing required target service/image metadata | Planning is blocked with `unsupported-container-native-profile`; framework/buildpack evidence cannot replace the explicit profile. |

## Boundary Matrix

| Test ID | Preferred automation | Case | Expected result |
| --- | --- | --- | --- |
| WF-PLAN-BOUND-001 | contract | Deployment command rejects framework fields | `deployments.create` rejects `framework`, `packageName`, `baseImage`, `runtimePreset`, `buildpack`, and language-version fields at schema/API boundary. |
| WF-PLAN-BOUND-002 | integration | Base image is planner output | Runtime plan metadata records selected base-image policy from typed evidence; command input and resource identity do not contain ad-hoc base image strings. |
| WF-PLAN-BOUND-003 | integration | Runtime command specs are typed | Planner emits typed install/build/start/package specs or shell-script leaves; adapter-rendered shell appears only at execution/display boundary. |
| WF-PLAN-BOUND-004 | integration | Target capability mismatch | A valid workload plan on a target without required image build, Compose, verify, logs, or health capability fails as `runtime_target_unsupported` before acceptance when safe. |
| WF-PLAN-BOUND-005 | contract | Core stays provider/framework independent | Core value objects use stable platform vocabulary and do not import framework package types, Docker SDK response types, provider SDK types, filesystem readers, or shell executors. |
| WF-PLAN-BOUND-006 | integration | Sanitized diagnostics only | Planner and runtime failure details include safe evidence fields and omit secrets, registry tokens, raw env values, and unbounded command output. |

## Fixture Deploy Smoke Matrix

These rows prove that each currently supported JavaScript/TypeScript and Python fixture moves
beyond detect/plan evidence into Docker/OCI execution readiness. Real Docker runs are preferred
where the environment provides Docker and dependency installs; headless smoke is acceptable when it
asserts the equivalent Dockerfile/build/run/verification evidence without executing framework CLIs.

| Test ID | Preferred automation | Fixture family | Case | Expected result |
| --- | --- | --- | --- | --- |
| WF-PLAN-SMOKE-001 | integration, opt-in Docker e2e | Static frontend | Next static export, Vite, React, Vue, Svelte, Solid, Angular, Nuxt generate, Astro static, and SvelteKit static fixtures start from source/runtime/network resource profile fields | Planner selects a static image artifact, generated Dockerfile packages the publish directory into the adapter-owned static server, internal port is 80 unless the resource profile overrides it, and typed Docker build/run commands are renderable from the plan. Representative opt-in real Docker coverage is tracked by `WF-PLAN-SMOKE-005`; full real Docker/SSH coverage for every static catalog fixture remains a migration gap. |
| WF-PLAN-SMOKE-002 | integration, opt-in Docker e2e | Node HTTP and SSR server | Next SSR/standalone, Remix, Express, Fastify, NestJS, Hono, Koa, and generic Node fixtures start from the same profile vocabulary | Planner selects a workspace-command image artifact with Node/Bun base policy, install/build/start commands, resource-owned internal port, internal HTTP verification, and no deployment-owned framework fields. Representative opt-in real Docker coverage is tracked by `WF-PLAN-SMOKE-005`; full real Docker/SSH coverage for every Node catalog fixture remains a migration gap. |
| WF-PLAN-SMOKE-003 | integration, opt-in Docker e2e | Python and JVM HTTP server | FastAPI, Django, Flask, generic Python, Spring Boot, and generic JVM fixtures when present start from the same profile vocabulary | Planner selects a workspace-command image artifact with language-family base policy, package/build-tool install/build/start command, resource-owned internal port, internal HTTP verification, and no deployment-owned framework fields. Representative opt-in real Docker coverage is tracked by `WF-PLAN-SMOKE-005`; full real Docker/SSH coverage for every Python/JVM catalog fixture remains a migration gap. |
| WF-PLAN-SMOKE-004 | integration | Unsupported or ambiguous fixture boundary | Unsupported framework evidence or ambiguous hybrid evidence lacks explicit fallback commands | Planning fails with `validation_error` in phase `runtime-plan-resolution`; explicit fallback commands may instead produce a Docker/OCI image plan without adding deployment command fields. |
| WF-PLAN-SMOKE-005 | opt-in local Docker e2e | Representative real local Docker fixture slice | Vite or Next static export plus Angular SPA, React SPA, or SvelteKit static; Next SSR or Remix plus one Node HTTP framework; FastAPI plus Django or Flask when dependency installation is available, otherwise Django plus Flask with the FastAPI dependency gap recorded | The same resource source/runtime/network profile draft used by Quick Deploy is persisted before ids-only `deployments.create` or equivalent shell workflow; Docker really builds an image, starts a container, resolves the published internal HTTP verification URL, records runtime metadata/logs, and exposes typed Docker build/run command evidence without framework/base-image/buildpack deployment fields. |
| WF-PLAN-SMOKE-006 | opt-in SSH e2e or contract with migration gap | Representative generic-SSH fixture slice | The same representative fixture descriptors used by `WF-PLAN-SMOKE-005`, executed through generic-SSH when a real target is configured | The harness selects the generic-SSH backend from the same resource profile and proves remote Docker build/run/verification when enabled. Without a configured SSH target, contract coverage may prove backend selection, but real SSH fixture execution remains an explicit migration gap. |

## Entry Parity Matrix

| Test ID | Preferred automation | Entry | Expected test focus |
| --- | --- | --- | --- |
| WF-PLAN-ENTRY-001 | e2e-preferred | Web Quick Deploy | Web source inspection may suggest resource name, strategy, commands, publish directory, and internal port, then dispatches `resources.create` plus ids-only `deployments.create`. |
| WF-PLAN-ENTRY-002 | e2e-preferred | CLI Quick Deploy | CLI uses the same inspection/planner contract as Web, prompts or errors for missing fallback commands, and never sends framework/base-image fields to `deployments.create`. |
| WF-PLAN-ENTRY-003 | contract | HTTP/oRPC strict deployment admission | HTTP/oRPC deployment create accepts only the shared ids-only command schema and does not read local source files or repository config files. |
| WF-PLAN-ENTRY-004 | e2e-preferred | Repository config / headless profile | Config profile fields map to resource source/runtime/network/health operations before deployment; unsupported framework/runtime sizing/orchestrator fields are rejected before mutation. |
| WF-PLAN-ENTRY-005 | contract | Shared draft field vocabulary | Web, CLI, and repository config normalize source base directory, publish directory, Dockerfile path, Compose path, build target, install/build/start commands, runtime name, internal port, network exposure, target service, host port, and health fields into the same `resources.create` profile shape before ids-only `deployments.create`. |
| WF-PLAN-ENTRY-006 | contract | Explicit fallback commands | For supported JavaScript/TypeScript/Python sources whose framework evidence lacks safe production start or static output evidence, entry workflows accept only explicit profile fallback commands or fail with structured `validation_error` before deployment admission; fallback commands are never deployment command fields. |

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
JavaScript/TypeScript tested catalog closure rows `WF-PLAN-JS-001` through `WF-PLAN-JS-013` bind
the current Next.js, Remix, Nuxt generate, SvelteKit static/ambiguous, Astro static, SPA static,
Node HTTP framework, generic package-script, missing evidence, and internal-port behavior to
executable fixture tests. Python tested catalog closure rows `WF-PLAN-PY-001` through
`WF-PLAN-PY-013` bind the Python ASGI/WSGI hardening round to executable fixture and contract
tests. JVM tested catalog closure rows `WF-PLAN-JVM-001` through `WF-PLAN-JVM-015` bind Spring Boot
Maven/Gradle, generic JVM fallback, unsupported JVM framework, ambiguous build-tool, missing build
tool, missing runnable jar, actuator health, internal-port, and preview parity behavior to
executable fixture and contract tests.
Fixed-version framework fixture tests now cover detector evidence for the table above, enforce exact
manifest/requirements versions, and feed supported fixtures through runtime planning without
installing dependencies or executing framework CLIs. Planner fixture coverage includes Next.js SSR,
Next.js standalone output, Next.js static export, Vite, React SPA static, Vue SPA static, Svelte SPA
static, Solid SPA static, SvelteKit adapter-static, Nuxt generate, Astro static, Remix, Express,
Fastify, NestJS, Hono, Koa, generic Node package scripts, FastAPI, Django, Flask, deterministic
generic ASGI, deterministic generic WSGI, Poetry Python web projects, and explicit Python start
fallbacks, Spring Boot Maven/Gradle, generic deterministic JVM jar, and explicit JVM start
fallbacks, including Angular `angular.json` output-path planning.
`WF-PLAN-BOUND-001` has command-schema coverage for rejecting framework/package/base-image/buildpack
deployment fields. `WF-PLAN-ENTRY-005` and `WF-PLAN-ENTRY-006` govern the current Web/CLI/repository
config draft parity slice for JavaScript/TypeScript/Python support. This does not yet complete
unsupported catalog families, SvelteKit server-adapter start inference, Astro SSR, worker plans, or
full browser-level Web/CLI entry parity for every catalog fixture.

`WF-PLAN-SMOKE-001` through `WF-PLAN-SMOKE-003` cover the current supported
JavaScript/TypeScript/Python/JVM fixture catalog through headless Docker/OCI execution readiness. They
prove the resource source/runtime/network profile can resolve to generated Dockerfile evidence,
image artifact intent, docker-container execution, internal HTTP verification, and typed Docker
command rendering without adding framework-specific deployment fields. Python coverage includes
FastAPI with `uv`, Django and Flask with pip/requirements, deterministic generic ASGI/WSGI, Poetry,
explicit start fallback, missing ASGI app, and ambiguous app-target rejection. JVM coverage includes
Spring Boot Maven/Gradle, generic deterministic jar, explicit start fallback, unsupported framework,
ambiguous build-tool, missing build tool, and missing runnable jar rejection. Full real Docker/SSH
execution for every catalog fixture remains a migration gap until opt-in environment coverage is
broadened.

`WF-PLAN-SMOKE-005` is the first opt-in real Docker slice and is intentionally narrower than the
full catalog. It proves a representative static/frontend, Node/server, and Python/server set can
actually build, run, and verify through the local Docker path. `WF-PLAN-SMOKE-006` keeps SSH on the
same profile/harness contract; real SSH execution remains a migration gap unless an opt-in target is
configured.

Current `WF-PLAN-SMOKE-005` local Docker coverage runs Vite SPA, React SPA, Next SSR, Hono,
Django, and Flask through real image build, container run, internal HTTP verification, deployment
detail runtime metadata, resource detail state, generated Dockerfile assertions, and Docker
build/run log evidence. FastAPI remains a real-smoke migration gap in the current local Docker
environment because pip could not resolve the required transitive `pydantic` dependency while
building the fixture image. Angular SPA and SvelteKit static remain real-smoke fixture-hardening
gaps because their current catalog fixtures failed before container start during dependency/build
execution.

Before a framework family can be marked first-class, Code Round must add at least one planner or
fallback test for its `WF-PLAN-CAT-*` row plus boundary coverage proving base-image policy,
artifact output, network/readiness behavior, and absence of deployment command fields.

## Open Questions

- Which unsupported catalog families should be implemented first after the current JavaScript,
  Python, Spring Boot/JVM, static, and custom-command slices?
