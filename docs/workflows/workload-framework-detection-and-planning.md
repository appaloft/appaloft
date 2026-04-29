# Workload Framework Detection And Planning Workflow Spec

## Normative Contract

Workload framework detection and planner selection is an internal capability of resource creation
workflows and `deployments.create` runtime planning. It is not a public command, not a transport
shortcut, and not a deployment method.

The capability turns a normalized resource source/runtime/network profile into typed source
inspection evidence and then into a Docker/OCI-backed workload artifact plan governed by
[ADR-021: Docker/OCI Workload Substrate](../decisions/ADR-021-docker-oci-workload-substrate.md).

All Web, CLI, API, automation, and future MCP entrypoints must converge on the same resource
profile and deployment command semantics:

```text
ResourceSourceBinding + ResourceRuntimeProfile + ResourceNetworkProfile
  -> materialize source root
  -> inspect source evidence
  -> select framework/runtime planner
  -> resolve base image and typed install/build/start/package steps
  -> produce image or Compose artifact intent
  -> deployments.create continues with runtime target execution
```

Detection may improve defaults, but command admission must remain deterministic. If a source cannot
be planned by a supported planner and the caller has not provided enough explicit runtime profile
commands to use the generic planner, deployment admission must fail with `validation_error` in
phase `runtime-plan-resolution`.

## Global References

This workflow inherits:

- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-014: Deployment Admission Uses Resource Profile](../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [ADR-021: Docker/OCI Workload Substrate](../decisions/ADR-021-docker-oci-workload-substrate.md)
- [ADR-023: Runtime Orchestration Target Boundary](../decisions/ADR-023-runtime-orchestration-target-boundary.md)
- [resources.create Command Spec](../commands/resources.create.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [deployments.create Workflow Spec](./deployments.create.md)
- [Quick Deploy Workflow Spec](./quick-deploy.md)
- [Resource Create And First Deploy Workflow Spec](./resources.create-and-first-deploy.md)
- [Workload Framework Detection And Planning Test Matrix](../testing/workload-framework-detection-and-planning-test-matrix.md)
- [deployments.create Test Matrix](../testing/deployments.create-test-matrix.md)
- [Quick Deploy Test Matrix](../testing/quick-deploy-test-matrix.md)
- [Deployment Runtime Substrate Implementation Plan](../implementation/deployment-runtime-substrate-plan.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## ADR Need Decision

No new ADR is required for this Spec Round. The change refines the planner evidence and support
catalog governed by the accepted boundaries:

- ADR-012 places source/runtime/profile evidence on the Resource side and keeps deployment
  snapshots immutable.
- ADR-014 keeps `deployments.create` ids-only and forbids framework, package, base-image, and
  runtime preset fields on deployment admission.
- ADR-015 makes listener ports resource network profile fields.
- ADR-021 requires every v1 plan to produce, pull, or reference Docker/OCI image artifacts or a
  Compose project.
- ADR-023 keeps runtime target capabilities and orchestrator-specific rendering behind runtime
  target backends.

A new ADR is required before Appaloft accepts non-Docker runtime substrates, public base-image
override fields, provider-specific buildpack/runtime preset fields, public orchestrator fields, or
framework-specific deployment commands.

## Boundary

Source inspection facts are typed planning evidence, not a generic metadata bag and not aggregate
invariants. Detection and planner selection may live in application services or adapters because
they inspect files, package manifests, lockfiles, build tool configuration, and provider-specific
source materialization. Core may define stable value objects for normalized evidence once a field is
part of the contract.

The source-of-truth planning inputs are:

| Input | Owner | Meaning |
| --- | --- | --- |
| `ResourceSourceBinding` | Resource profile | Source kind, cloneable/materializable locator, git ref, base directory, Docker image identity, artifact root, and safe source identity. |
| `ResourceRuntimeProfile` | Resource profile | Runtime plan strategy, explicit install/build/start command defaults, framework/runtime hints when provided, Dockerfile/Compose/static fields, health defaults. |
| `ResourceNetworkProfile` | Resource profile | Internal listener port, upstream protocol, exposure mode, and target service used by runtime and route planning. |
| `SourceInspectionSnapshot` | Planning evidence | Typed detected facts from the materialized source root, such as runtime family, framework, package manager, package/project name, lockfiles, build files, scripts, and runtime version. |
| Planner registry | Application/adapter boundary | Ordered set of framework/runtime planners. It selects the most specific compatible planner before generic fallback. |

The source-of-truth planner outputs are:

| Output | Meaning |
| --- | --- |
| `plannerKey` | Stable identifier for the selected planner, for example `nextjs`, `vite-static`, `django`, or `generic-node`. |
| `runtimeFamily` | Broad language/runtime family such as `node`, `python`, `ruby`, `php`, `go`, `java`, `dotnet`, `elixir`, `rust`, or `static`. |
| `framework` | Framework or platform flavor when detected, such as `nextjs`, `sveltekit`, `fastapi`, `rails`, or `laravel`. |
| `projectName` | Safe package/project name detected from manifests, used for defaults and diagnostics only. It must not become deployment identity. |
| `packageManager` or `buildTool` | Tool used for install/build/run, such as `bun`, `npm`, `pnpm`, `yarn`, `pip`, `uv`, `poetry`, `composer`, `maven`, `gradle`, `go`, `cargo`, or `dotnet`. |
| `baseImage` | Abstract planner-selected OCI image identity. It is runtime-planner output or future runtime-profile configuration, not `deployments.create` input. |
| `install`, `build`, `start`, `package` steps | Typed runtime command specs or safe command leaves that become Dockerfile/build/runtime steps. Rendered shell is adapter output only. |
| `artifactIntent` | `build-image`, `prebuilt-image`, or `compose-project` according to ADR-021. |
| `publishDirectory` or artifact path | Static/build output when the framework produces files or a packaged binary/jar. |
| `warnings` | Non-fatal planner observations exposed through diagnostics or preflight surfaces. |

## Detection Evidence

Detectors must prefer explicit user/resource profile input over inferred defaults. When inference is
used, the detected fact must be recorded as typed evidence whenever it affects planner selection,
base image selection, command defaults, publish directory, or support diagnostics.

Minimum evidence categories:

| Evidence | Examples |
| --- | --- |
| Language/runtime family | `node`, `python`, `ruby`, `php`, `go`, `java`, `dotnet`, `elixir`, `rust`, `static`, `custom`. |
| Framework | `nextjs`, `remix`, `nuxt`, `sveltekit`, `astro`, `vite`, `react`, `vue`, `svelte`, `solid`, `angular`, `express`, `fastify`, `nestjs`, `hono`, `django`, `flask`, `fastapi`, `rails`, `laravel`, `spring-boot`, `aspnet-core`, `phoenix`, `axum`. |
| Package/project name | `package.json.name`, `pyproject.toml project.name`, `composer.json.name`, Maven/Gradle artifact/root name, `.csproj` assembly/project name, `go.mod` module, `Cargo.toml package.name`, `mix.exs` app name. |
| Package manager/build tool | `bun`, `npm`, `pnpm`, `yarn`, `pip`, `uv`, `poetry`, `composer`, `maven`, `gradle`, `go`, `dotnet`, `cargo`, `mix`. |
| Runtime version | `.node-version`, `.nvmrc`, `package.json.engines.node`, `.python-version`, `.ruby-version`, `.java-version`, `global.json`, `go.mod`, `rust-toolchain`, `elixir`/`erlang` files. |
| Build/run scripts | `build`, `start`, `start:built`, `dev`, framework commands, generated static/export commands, jar/package commands. |
| Build files | `package.json`, lockfiles, `next.config.*`, `vite.config.*`, `svelte.config.*`, `nuxt.config.*`, `astro.config.*`, `angular.json`, `pyproject.toml`, `requirements.txt`, `Gemfile`, `composer.json`, `go.mod`, `pom.xml`, `build.gradle*`, `.csproj`, `mix.exs`, `Cargo.toml`. |
| Artifact output | `dist`, `build`, `.next/standalone`, `out`, `.output`, `public`, `target/*.jar`, `build/libs/*.jar`, `bin/*`, compiled binary path. |
| Runtime endpoint hint | Framework default listener only when deterministic. User-supplied `ResourceNetworkProfile.internalPort` wins. |

Detectors must not:

- install dependencies or execute untrusted project code during admission-time detection;
- store secrets, tokens, environment values, or raw provider responses as detection evidence;
- persist provider SDK types, Docker SDK responses, or framework package objects in core state;
- treat a detected package/project name as the resource id, deployment id, or security boundary.

## Detection And Plan Input Contract

Detection produces typed evidence for planning. It does not mutate resource identity by itself and
does not create transport fields. Entry workflows may use evidence to prefill resource profile
drafts, but the write boundary remains `resources.create` or a future resource profile update
operation followed by ids-only `deployments.create`.

Web Quick Deploy, CLI interactive deploy, and repository config/headless deploy must use the same
resource-profile draft vocabulary before dispatch. The shared draft vocabulary is:

| Draft field | Resource owner field |
| --- | --- |
| Source directory or source root subdirectory | `ResourceSourceBinding.baseDirectory` |
| Publish directory | `ResourceRuntimeProfile.publishDirectory` |
| Dockerfile path | `ResourceRuntimeProfile.dockerfilePath` |
| Docker Compose file path | `ResourceRuntimeProfile.dockerComposeFilePath` |
| Docker build target | `ResourceRuntimeProfile.buildTarget` |
| Install command | `ResourceRuntimeProfile.installCommand` |
| Build command | `ResourceRuntimeProfile.buildCommand` |
| Start command | `ResourceRuntimeProfile.startCommand` |
| Runtime name | `ResourceRuntimeProfile.runtimeName` |
| Internal application port | `ResourceNetworkProfile.internalPort` |
| Upstream protocol, exposure mode, target service, and host port | `ResourceNetworkProfile` |
| Health path or HTTP health policy | `ResourceRuntimeProfile.healthCheckPath` or resource health policy input |

Framework detection may prefill this draft vocabulary. Repository config may declare the same
profile fields. CLI flags may override the same profile fields. None of these fields may be
forwarded to `deployments.create`.

When detection cannot derive a safe production start command, publish directory, Dockerfile path,
Compose path, or internal port for an inbound app, Web/CLI entry workflows must collect the missing
field explicitly or fail before mutation. Repository config/headless workflows must either provide
the missing profile field or receive a structured `validation_error`/`unsupported_config_field`
before mutation. Generic fallback commands are accepted only as explicit
`ResourceRuntimeProfile.installCommand`, `buildCommand`, and `startCommand` values that still plan a
Docker/OCI image.

### Package Manager And Build Tool Resolution

Planner selection must record the selected package manager or build tool when that choice changes
install, build, package, start, base-image, cache, or diagnostic behavior.

| Runtime family | Evidence precedence |
| --- | --- |
| Node/Bun | Explicit resource runtime profile tool, then `packageManager` from `package.json` when valid, then lockfiles in this order: `bun.lockb`/`bun.lock`, `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`/`npm-shrinkwrap.json`; conflicting lockfiles are warnings only when an explicit tool resolves the conflict, otherwise ambiguity must be surfaced through diagnostics or `validation_error` when the selected planner requires one tool. |
| Python | Explicit tool, then `uv.lock`, Poetry metadata/`poetry.lock`, PEP 621 `pyproject.toml`, `requirements.txt`, then generic `pip`. A planner must not install multiple Python toolchains unless the selected planner explicitly owns that behavior. |
| Ruby | `Gemfile.lock` and `Gemfile` select Bundler. Rails/Sinatra/Rack detection cannot bypass Bundler when a Gemfile exists. |
| PHP | `composer.lock`/`composer.json` select Composer. PHP-FPM, Laravel, and Symfony planners may add server/runtime packaging, but Composer remains the package dependency tool. |
| Go | `go.mod` selects Go modules. `go.work` may indicate a workspace, but the selected source base directory still owns the deployable module. |
| Java/JVM | `pom.xml` selects Maven unless a Gradle file is selected by explicit profile or source root; `build.gradle`, `build.gradle.kts`, and Gradle wrapper files select Gradle. Ambiguous Maven/Gradle roots require explicit profile selection. |
| .NET | `global.json` and project/solution files select the .NET SDK version and project. Multiple runnable projects require explicit source base directory or project file selection. |
| Elixir | `mix.exs` and lockfile select Mix; Phoenix detection may add release-specific packaging. |
| Rust | `Cargo.toml`, `Cargo.lock`, and `rust-toolchain*` select Cargo and the toolchain. Workspaces require selected package/bin evidence. |
| Static generators outside language package managers | Framework config or well-known generator files, such as Hugo or Jekyll config, select the generator-specific build tool. If the generator needs a language package manager, both facts must be recorded. |

### Framework Signal Strength

Planner selection must rank signals by specificity:

1. Explicit `ResourceRuntimeProfile.strategy` and strategy-specific fields.
2. Explicit future resource runtime-profile hints, when their specs exist.
3. Framework config files under the selected source base directory.
4. Manifest dependencies and declared package/build scripts.
5. Well-known project files such as `manage.py`, `artisan`, `mix.exs`, or `.csproj`.
6. Conventional output directories only when paired with a compatible build or framework signal.

Detected dependency names alone are insufficient to choose a production start command when multiple
frameworks or runnable apps are present. Development scripts such as `dev`, `serve`, `preview`, or
framework watch modes must not be used as production start commands unless the user explicitly
accepts them as custom command leaves in a runtime profile.

### Application Shape Classification

Every selected planner must classify the deployable shape because the classification determines the
artifact rule, required network profile, readiness expectations, and fallback behavior.

| Classification | Meaning | Artifact rule | Network/readiness contract |
| --- | --- | --- | --- |
| `static` | Build output is files served by a static HTTP server. | Package `publishDirectory` into a Docker/OCI static-server image with Appaloft-owned static routing. | Default `internalPort = 80`, `upstreamProtocol = http`, `exposureMode = reverse-proxy` for first-deploy drafts. Readiness is static-server HTTP readiness, not the build command finishing. Exact files and directory indexes are served before extensionless app-route fallback. Missing extension-bearing assets return `404`. |
| `serverful-http` | The app starts a long-lived HTTP process. | Build a Docker/OCI image and run the selected start command. | `ResourceNetworkProfile.internalPort` is required unless a deterministic planner hint is persisted before deployment admission. Health policy defaults may target `/`, but explicit resource health policy wins. |
| `ssr` | The app renders server-side routes at runtime and may also produce client/static assets. | Build a Docker/OCI image containing build output and server runtime entrypoint. | Same as `serverful-http`; static output is not sufficient unless an explicit static-export mode is selected. |
| `hybrid-static-server` | The framework can produce either static output or a runtime server depending on adapter/config. | Planner must choose static or serverful based on explicit strategy, adapter/config, or safe evidence. | Ambiguous mode fails `runtime-plan-resolution` or requires entry workflow selection. |
| `worker` | No inbound HTTP endpoint is required. | Build a Docker/OCI image with a long-running worker command. | `exposureMode = none`; no generated access route is expected. Public Web app detection must not silently classify an HTTP app as worker to avoid missing port input. |
| `container-native` | Dockerfile, Compose, or prebuilt image is explicit. | Use the explicit Docker/OCI or Compose artifact path. | Framework detection may add diagnostics but must not override explicit container intent. |

### Build, Start, And Artifact Rules

Explicit runtime profile commands always win. Inferred commands are valid only when they are
deterministic for the selected framework and source base directory.

- Static planners require a safe `publishDirectory` or a deterministic framework static output
  convention. If a build command is required to create the output, the build command is a package
  step before static-server image packaging.
- Serverful and SSR planners require a production start command. A detected `start` script is valid
  when it does not invoke a dev/watch server. Framework-derived start commands are valid only when
  the required server artifact path or app module is known.
- Generic language planners may use custom install/build/start commands from
  `ResourceRuntimeProfile`, but they must still package those commands into a Docker/OCI image.
- Dockerfile, Compose, and prebuilt image strategies override framework detection for artifact
  construction. Detection may report warnings, package names, or likely health/port hints, but it
  must not replace an explicit Dockerfile, Compose project, or image reference.

### Fixture Deploy Smoke Contract

Framework fixture smoke tests are headless deployment-planning acceptance tests for the current
support catalog. They must start from the same resource profile fields that Web, CLI, and
repository config collect, then prove that ids-only deployment admission can resolve a Docker/OCI
runtime plan.

The canonical smoke path is:

```text
ResourceSourceBinding + ResourceRuntimeProfile + ResourceNetworkProfile
  -> SourceInspectionSnapshot
  -> RuntimePlanResolver
  -> RuntimeArtifactSnapshot(kind = image or compose-project)
  -> docker-container or docker-compose execution plan
  -> generated Dockerfile/build/run command evidence or an opt-in real Docker run
```

Smoke tests may be headless when the CI environment cannot install dependencies, build images, or
run Docker. A headless smoke still must prove equivalent execution readiness by asserting the
selected planner, image/Compose artifact intent, generated Dockerfile or Compose plan, runtime
port, verification steps, and typed Docker command rendering. It must not execute framework CLIs
during source detection.

Opt-in real fixture smoke is the next confidence layer above headless evidence. It must run only
when the operator explicitly enables Docker or SSH mutation, and it must start from the same
resource source/runtime/network profile draft as Quick Deploy before dispatching ids-only
deployment admission or an equivalent shell workflow. A passing real smoke must prove actual image
build, container start, internal HTTP verification, runtime metadata/log visibility, and typed
Docker command rendering for a representative fixture slice. The first representative local Docker
slice covers:

- static/frontend: Vite or Next static export plus one non-Vite static/frontend fixture such as
  Angular SPA or SvelteKit static;
- Node/server: Next SSR or Remix plus one Node HTTP framework fixture such as Express, Fastify,
  NestJS, Hono, or Koa;
- Python/server: FastAPI plus Django or Flask. If FastAPI cannot be executed in the current Docker
  environment because dependency installation is unavailable, the first local slice may use Django
  plus Flask only when the FastAPI failure is recorded as a migration gap with the exact dependency
  or fixture-build cause.

SSH smoke may reuse the same fixture/profile harness behind a generic-SSH backend, but absence of a
real SSH target must be recorded as a migration gap rather than skipped as a pass.

Fixture smoke coverage must be table-driven by fixture descriptors and planner descriptors. Adding
a new framework should mean adding detection/planner data and a fixture expectation, not adding a
new public command, framework-specific deployment input field, or transport-only branch.

### Port And Readiness Rules

`ResourceNetworkProfile.internalPort` is the durable resource endpoint. Framework default ports are
entry-workflow hints only until persisted as `networkProfile.internalPort`.

- Static first-deploy drafts default to `internalPort = 80`.
- Common serverful hints such as `3000`, `4000`, `5000`, `8000`, `8080`, or `5000/8000` by
  framework are allowed as draft defaults, but user-supplied `networkProfile.internalPort` wins.
- If an inbound app has no persisted internal port and the planner cannot infer one
  deterministically before admission, `deployments.create` fails in phase
  `resource-network-resolution`.
- Readiness belongs to deployment verification and resource health observation. The planner may set
  a default HTTP health path only when it is a known framework contract; otherwise `/` is a safe
  default only as a probe target, not proof of app-level health.

## Support Catalog

The target support catalog for mainstream web application deployment is:

| Family/frameworks | Classification | Required signals | Default build/package and artifact rule | Start/readiness rule |
| --- | --- | --- | --- | --- |
| Next.js runtime app | `ssr` or `serverful-http` | `next` dependency or `next.config.*` under selected source root; package manager evidence; App Router (`app`/`src/app`) and Pages Router (`pages`/`src/pages`) evidence when present | Install, run `next build`; package default server output as a Docker/OCI image, or package `output: "standalone"` as a Docker/OCI image that starts `.next/standalone/server.js`; record router/output evidence, base image policy, and install/build/start metadata in planner diagnostics | Start with deterministic Next server/standalone command only when output is known; otherwise require explicit start command. Port hint is 3000 unless resource network profile supplies another port. Conflicting output evidence fails `runtime-plan-resolution` unless explicit custom commands select a Docker/OCI image plan. |
| Next static export | `static` | Explicit static strategy, `output: "export"`, or safe export/build script evidence; App/Pages Router evidence when present | Build static output and package `out` or explicit publish directory into the adapter-owned static-server image; record publish directory, static server config, router/output evidence, base image policy, and install/build metadata in planner diagnostics | Static server on port 80 by default; no Next runtime server is started. |
| Remix | `ssr` | Remix dependency/config and build script evidence | Install and run selected Remix build; package server artifact and public assets into Docker/OCI image | Start command must be explicit or derived from supported server adapter output; port is resource network input or deterministic adapter hint. |
| Nuxt | `ssr` or `static` | `nuxt` dependency or `nuxt.config.*`; generate/static evidence when selected | SSR uses `nuxi build` and `.output/server`; static uses `nuxi generate` and `.output/public`; package image or static-server image accordingly | SSR starts Nitro server from `.output`; static starts static server on port 80. |
| SvelteKit | `hybrid-static-server` | `svelte.config.*`, SvelteKit dependency, and adapter evidence | `adapter-static` or explicit static strategy packages static output; server adapters package the generated server runtime into Docker/OCI image | Static uses port 80; server adapters require a start command or supported adapter entrypoint plus resource network port. |
| Astro | `static` or `ssr` | `astro.config.*` or Astro dependency; adapter/output mode | Default static output packages `dist`; SSR adapter output packages a server runtime image | Static uses port 80; SSR requires supported adapter start evidence and resource network port. |
| Vite, Angular, React/Vue/Svelte/Solid SPA, Docusaurus | `static` | Vite/Angular/Docusaurus config or package scripts; output convention | Run build script and package `dist`, `build`, `public`, Angular browser output, or explicit publish directory into static-server image | Static server on port 80 by default. Preview/dev servers are not production runtime commands. |
| Express, Fastify, NestJS, Hono, Koa, generic Node HTTP apps | `serverful-http` | Package manifest plus framework dependency, entrypoint, or non-dev start script | Install/build when script exists; package app into Docker/OCI image with selected Node/Bun base policy | Production `start` script or deterministic framework start is required; internal port must be supplied or inferred from accepted profile evidence. |
| FastAPI | `serverful-http` | Python project metadata plus FastAPI dependency, ASGI module hint, or explicit start command | Install with detected Python tool; package Docker/OCI image | Start with `uvicorn` only when ASGI module/app can be safely identified; otherwise require explicit start command. |
| Django | `serverful-http` | `manage.py`, Django dependency, settings/module evidence | Install with detected Python tool; collect/static/package as needed; Docker/OCI image | Start with supported WSGI/ASGI command only when project module is known; otherwise explicit start required. |
| Flask | `serverful-http` | Flask dependency plus app module or explicit start command | Install with detected Python tool; package Docker/OCI image | Start with supported WSGI command only when module/app object is known; otherwise explicit start required. |
| Rails, Sinatra, Rack | `serverful-http` | `Gemfile`, Rails/Rack/Sinatra dependencies, `config.ru` or Rails app files | `bundle install`, optional asset build when configured, package Docker/OCI image | Start with Puma/Rails/Rack command when framework output is deterministic; port hint may be 3000 for Rails but resource network profile wins. |
| Laravel, Symfony, generic PHP web apps | `serverful-http` | `composer.json`, framework files such as `artisan` or Symfony kernel/config | Composer install; package PHP runtime plus web server or PHP-FPM profile into Docker/OCI image | Planner owns PHP server/FPM boundary; resource network endpoint targets the served HTTP port, not PHP internals unless a future profile says otherwise. |
| Go HTTP services | `serverful-http` | `go.mod`, selected module/package, optional known framework dependency | Compile binary in build stage; package runtime image with binary | Start binary; internal port required unless explicit profile or deterministic binary config provides it. |
| Spring Boot, Quarkus, Micronaut, generic JVM web services | `serverful-http` | Maven/Gradle project plus framework plugins/dependencies or runnable jar metadata | Build/package jar/native artifact and package runtime image | Start `java -jar` or native binary when artifact is known; common port hints such as 8080 are draft defaults only. |
| ASP.NET Core | `serverful-http` | Web SDK/project file, solution/project selection, `global.json` when present | `dotnet publish` and package runtime image | Start published assembly; port is resource network input or accepted ASP.NET runtime default from profile. |
| Phoenix and Plug/Cowboy | `serverful-http` | `mix.exs`, Phoenix/Plug dependencies, release config | Build release and package Docker/OCI image | Start release command; port hint is framework/runtime config only and resource profile wins. |
| Axum, Actix Web, Rocket, generic Rust HTTP apps | `serverful-http` | `Cargo.toml`, selected package/bin, web framework dependency or explicit start command | Build release binary and package runtime image | Start binary; internal port required unless accepted framework config supplies a deterministic port. |
| Dockerfile | `container-native` | Explicit Dockerfile strategy/path | Build OCI image from resolved source root and Dockerfile path | Runtime endpoint still comes from resource network profile; detection cannot override Dockerfile intent. |
| Docker Compose | `container-native` | Explicit Compose strategy/path | Materialize Compose project whose runnable services use/build OCI images | `targetServiceName` is required when inbound target service is ambiguous. |
| Prebuilt image | `container-native` | Docker image source with tag or digest | Pull or use image identity; skip build unless artifact verification is later modeled | Runtime endpoint and health policy come from resource network/profile, not image metadata unless a future image-inspection spec accepts it. |

Support is complete for a catalog entry only when all of these are specified and tested:

- detection evidence and precedence rules;
- default base image policy;
- install/build/start/package command specs;
- static or server artifact output rules;
- default publish directory or explicit publish directory requirement when static;
- default runtime endpoint hints and required `ResourceNetworkProfile.internalPort` behavior;
- failure code/phase when evidence is missing, ambiguous, or unsupported;
- runtime adapter Dockerfile/build/run behavior;
- Quick Deploy/Web/CLI parity for draft collection or explicit command fallback.

## Planner Selection

Planner selection order:

1. Explicit `RuntimePlanStrategy = dockerfile`, `docker-compose`, `prebuilt-image`, or `static`
   uses the strategy-specific planner and must not be overridden by framework detection.
2. Explicit framework/runtime hints in `ResourceRuntimeProfile`, when accepted by future profile
   specs, take precedence over inferred evidence.
3. Framework-specific planners run before generic language planners.
4. Generic language planners may run only when required install/build/start/package information can
   be derived or was supplied explicitly.
5. Custom planner fallback is allowed only when explicit runtime profile commands make the result
   containerizable.

When multiple frameworks are detected, the planner must prefer the framework attached to the source
base directory and the selected runtime strategy. If the result is ambiguous, entry workflows must
ask for explicit selection or `deployments.create` must fail with `validation_error` in phase
`runtime-plan-resolution`.

## Base Image Rules

Base image selection is planner output. It may depend on runtime family, framework, package manager,
runtime version, and explicit future runtime profile settings. It must not be an ad-hoc string
parsed from deployment command input.

Base image policies must be named and testable. Examples:

- Node/Bun planners choose `oven/bun` only when the package manager/runtime is Bun; otherwise they
  choose a Node image with the detected or default Node version.
- Static planners choose an adapter-owned static-server image or generated Dockerfile based on a
  known static artifact contract.
- Compiled-language planners may use multi-stage builds, but the final runtime image still belongs
  to the planner policy.

Changing the base image policy for an existing planner changes deployment behavior and must update
the implementation plan and test matrix in the same change.

## Docker And Runtime Capability Boundary

Framework planners produce provider-neutral artifact intent and typed runtime command specs. They
do not execute Docker, SSH, package managers, language installers, or framework CLIs during
admission-time detection.

The boundary is:

```text
SourceInspectionSnapshot + ResourceRuntimeProfile + ResourceNetworkProfile
  -> planner output: artifact intent, base image policy, typed install/build/start/package specs
  -> runtime target backend: render/apply/verify/log/cleanup on local shell, SSH, or future target
```

Runtime capability checks must be target-backend checks, not transport input checks:

- image build plans require a backend capable of image build/package and runtime apply;
- prebuilt image plans require image pull/use and runtime apply;
- Compose plans require Compose project materialization and target service observation;
- static-server plans require image build/package plus HTTP runtime verification;
- runtime log and health queries require backend `runtime.logs` and `runtime.health` capabilities
  before those read surfaces can claim live support.

If a selected target cannot support the resolved artifact or observation capability and that can be
known before safe acceptance, `deployments.create` fails with `runtime_target_unsupported` in phase
`runtime-target-resolution`. Post-acceptance render/apply/verify/log/cleanup failures are
deployment workflow failures and must be persisted as failed or unavailable state with sanitized
details.

Dockerfile templates, static-server images, generated web-server config, Compose project names,
container labels, shell commands, Kubernetes manifests, Swarm stacks, and provider SDK response
objects are adapter-owned artifacts. They may be exposed only through sanitized diagnostics,
runtime logs, resource health, proxy configuration previews, or deployment read models where those
read/query specs allow them.

## Error Contract

Framework detection and planner selection failures use existing deployment error phases:

| Failure | Error code | Phase | Retriable |
| --- | --- | --- | --- |
| Source cannot be inspected safely before planning | `validation_error` or `infra_error` | `source-detection` | No for invalid source, conditional for infrastructure failure |
| Detected framework/runtime has no supported planner and no explicit fallback commands | `validation_error` | `runtime-plan-resolution` | No |
| Supported planner lacks required evidence, such as package name, lockfile, start command, artifact path, or publish directory | `validation_error` | `runtime-plan-resolution` or `runtime-artifact-resolution` | No |
| Base image or package/build command cannot be resolved from accepted evidence | `validation_error` or `provider_error` | `runtime-plan-resolution` | No or conditional by provider cause |
| Image build/package fails after acceptance | `provider_error` or `infra_error` | `image-build` or `runtime-artifact-resolution` | Conditional |

Error details should include safe evidence fields such as `runtimeFamily`, `framework`,
`packageManager`, `projectName`, `plannerKey`, `baseImage`, `resourceSourceKind`,
`runtimePlanStrategy`, and detected file/script identifiers. Details must not include secret values
or unbounded command output.

## Current Implementation Notes And Migration Gaps

Current implementation is narrower than the target catalog.

Implemented planner families:

- `nextjs`;
- `nextjs-static` for detected export/static output evidence or explicit static strategy;
- generic `node`;
- `vite-static`;
- `react-static`;
- `vue-static`;
- `svelte-static`;
- `solid-static`;
- `astro-static`;
- `nuxt-static`;
- `sveltekit-static` for explicit static strategy or publish-directory selection;
- `remix`;
- `fastapi`;
- `django`;
- `flask`;
- generic `python`;
- generic `java`;
- custom command fallback.

Current typed detection is limited to:

- widened runtime family, framework, package-manager/build-tool, detected-file, and
  detected-script value objects covering the target catalog vocabulary;
- application-shape evidence for supported local JavaScript/TypeScript and Python framework
  detection, plus planner output metadata for `static`, `serverful-http`, `ssr`, and explicit
  `container-native` strategies;
- local JavaScript/TypeScript detection for common framework dependencies/config files and
  lockfiles, including React/Vue/Svelte/Solid SPA static evidence, Next.js App/Pages Router
  evidence, `output: "standalone"`,
  `output: "export"`/export-script, Nuxt `generate`, and SvelteKit `adapter-static`
  classification as `static`;
- local Python detection for FastAPI, Django, Flask, `uv`, Poetry, pip, lockfiles, and `manage.py`;
- local Java project detection;
- fixed-version fixture coverage for Next.js, Vite, Angular, SvelteKit, Nuxt, Astro, Remix,
  Express, Fastify, NestJS, Hono, Koa, generic Node package scripts, FastAPI, Django, and Flask
  source inspection;
- Vite, React SPA, Vue SPA, Svelte SPA, Solid SPA, Angular, Astro, Nuxt generate, Next.js
  standalone/static export, and SvelteKit adapter-static artifact planning.
- Node API framework and generic package-script fixtures plan through the generic Node workspace
  image planner with framework metadata, `serverful-http` application shape, package-manager
  policy, base-image policy, install/build/start command metadata, generated Dockerfile assertions,
  and structured `runtime-plan-resolution` errors when production start evidence is missing.
- SvelteKit ambiguous auto planning is rejected unless the workflow selects static explicitly or
  provides an explicit start command.

The following are migration gaps before the mainstream support catalog is complete:

- add detectors for remaining non-JavaScript catalog families and richer package/project names,
  static output conventions, and framework config files across the support catalog;
- add planner implementations for the unsupported catalog entries instead of routing them through
  generic custom commands by accident;
- test base image and application-shape policy per remaining framework family;
- enforce the remaining `hybrid-static-server` and `worker` shape branches before exposing them as
  first-class planner results;
- add Web/CLI Quick Deploy parity for framework/runtime draft fields and manual fallback commands;
- add deployment and Quick Deploy matrix rows for each support tier before Code Round expands the
  implementation.

## Open Questions

- Which catalog entries should be active in the next Code Round versus documented as planned
  target support behind explicit custom-command fallback?
