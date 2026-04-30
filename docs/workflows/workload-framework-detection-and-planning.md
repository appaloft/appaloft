# Workload Framework Detection And Planning Workflow Spec

## Normative Contract

Workload framework detection and planner selection is an internal capability of resource creation
workflows, `deployments.create` runtime planning, and read-only `deployments.plan` preview. It is
not a public command, not a transport shortcut, and not a deployment method.

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
  -> deployments.plan may return the preview here without execution
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
- [deployments.plan Query Spec](../queries/deployments.plan.md)
- [deployments.create Workflow Spec](./deployments.create.md)
- [Quick Deploy Workflow Spec](./quick-deploy.md)
- [Resource Create And First Deploy Workflow Spec](./resources.create-and-first-deploy.md)
- [Workload Framework Detection And Planning Test Matrix](../testing/workload-framework-detection-and-planning-test-matrix.md)
- [deployments.create Test Matrix](../testing/deployments.create-test-matrix.md)
- [Quick Deploy Test Matrix](../testing/quick-deploy-test-matrix.md)
- [Deployment Runtime Substrate Implementation Plan](../implementation/deployment-runtime-substrate-plan.md)
- [Deployment Plan Preview Implementation Plan](../implementation/deployment-plan-preview-plan.md)
- [Buildpack Accelerator Contract And Preview Guardrails](../specs/017-buildpack-accelerator-contract-and-preview-guardrails/spec.md)
- [Runtime Plan Resolution Unsupported/Override Contract](../specs/018-runtime-plan-resolution-unsupported-override-contract/spec.md)
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

Buildpack-style detection does not require a new ADR while it stays an adapter-owned accelerator
behind this workload-planning contract. A new ADR is required before buildpack builder/lifecycle
fields become public command input, before a concrete buildpack implementation becomes the
canonical support path for mainstream frameworks, or before buildpack output changes deployment
admission or runtime substrate semantics.

The runtime plan resolution unsupported/override contract does not require a new ADR while it
hardens the existing source/runtime/network/profile boundary. A new ADR is required before the
failure contract adds a deployment admission command, adds public source/runtime/framework fields to
`deployments.create`, changes the Docker/OCI workload substrate, or makes Web/CLI/future tool
entrypoints own planner business logic.

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
| `buildpackAccelerator` | Optional adapter-owned accelerator evidence, support tier, builder policy, detected buildpacks, limitations, and fix paths. It is preview/planning evidence only and never deployment command input. |

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
| Buildpack accelerator | Platform files, language-family hints, framework hints, builder evidence, detected buildpacks, lifecycle feature hints, and unsupported/ambiguous/missing evidence reason codes. |

Detectors must not:

- install dependencies or execute untrusted project code during admission-time detection;
- store secrets, tokens, environment values, or raw provider responses as detection evidence;
- persist provider SDK types, Docker SDK responses, or framework package objects in core state;
- treat a detected package/project name as the resource id, deployment id, or security boundary.

### Buildpack Accelerator Evidence

Buildpack-style detection is an adapter-owned accelerator and fallback candidate. It may inspect
safe files and metadata, but it must not run `pack`, buildpack lifecycle phases, project install
commands, framework CLIs, Docker, SSH, or application code during admission-time detection or
read-only preview.

The accelerator contract covers:

| Evidence | Examples |
| --- | --- |
| Platform files | `project.toml`, `Procfile`, `.buildpacks`, `.cnb`, buildpack/builder config, language manifests, lockfiles. |
| Language-family hints | Node, Python, JVM, Ruby, PHP, Go, .NET, Rust, Elixir, static, or unknown family evidence. |
| Framework hints | Safe dependency/config hints that can help a future explicit planner, such as Quarkus, Micronaut, Rails, Laravel, ASP.NET Core, Phoenix, Axum, or generic app-server evidence. |
| Builder evidence | Default builder policy, selected/allowed builder override source, blocked builder, run image hint, lifecycle feature hint. |
| Detected buildpacks | Buildpack ids/names/versions when safe; ambiguous or conflicting buildpack lists stay diagnostic evidence. |

Buildpack evidence is non-winning evidence whenever an explicit planner or profile owns the plan.
If it becomes the selected fallback, the preview support tier is `buildpack-accelerated` and the
artifact intent must still be Docker/OCI image build intent. The accelerator must not generate
deployment input overrides, persist hidden runtime/profile changes, or infer Appaloft-owned
identity.

Buildpack limitations must be visible in `deployments.plan`:

- default builder versus allowed override versus blocked unsupported builder;
- unsupported lifecycle feature or missing target capability;
- disabled or unavailable buildpack acceleration;
- ambiguous language/framework/buildpack evidence;
- missing internal port for inbound apps;
- missing deterministic start intent when the selected buildpack evidence cannot prove one;
- secret masking and build-time/public variable boundary;
- health policy boundary: buildpack must not infer app-level health unless explicit resource health
  policy exists.

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
| Generic ASGI/WSGI Python apps | `serverful-http` | Python package metadata plus deterministic `module:app` ASGI or WSGI evidence, or explicit start command | Install with detected Python tool; package Docker/OCI image | Start with Uvicorn/Gunicorn only when module/app target is unambiguous; otherwise explicit start required. |
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

### Python Planner Contract

Python planners follow the shared planner contract used by the JavaScript/TypeScript catalog
closure. A Python catalog row is complete only when tests prove:

- runtime family, framework or generic ASGI/WSGI shape, package/project name, package tool,
  detected files, and detected scripts are represented as typed evidence;
- package tool resolution follows explicit resource profile choice, then `uv.lock`, Poetry
  metadata or `poetry.lock`, PEP 621 `pyproject.toml`, `requirements.txt`, and generic pip fallback;
- `uv`, Poetry, and pip command rendering is deterministic and does not install multiple Python
  dependency toolchains unless the selected planner owns that behavior;
- ASGI/WSGI module/app discovery is deterministic before a framework-derived start command is
  emitted;
- explicit resource runtime profile commands win over inferred framework defaults and are the only
  fallback for missing or ambiguous Python app targets;
- all successful plans produce Docker/OCI workspace image artifact intent with generated Dockerfile
  evidence, internal HTTP verification, and resource-owned network/health behavior;
- unsupported, ambiguous, missing ASGI/WSGI app, missing production start command, and missing
  internal port cases return structured blocked reasons or `validation_error` in the governed
  phases instead of guessing.

### JVM Planner Contract

JVM planners follow the same shared planner contract used by the JavaScript/TypeScript and Python
catalog closures. A JVM catalog row is complete only when tests prove:

- runtime family, Spring Boot or generic JVM shape, safe project/artifact name, build tool,
  detected files, detected scripts, runtime version, and runnable artifact evidence are represented
  as typed evidence;
- build tool resolution follows explicit resource profile choice when that profile exists, then
  source-root-specific Maven/Gradle evidence. Maven wrapper and Gradle wrapper select wrapper
  command rendering for their owning tool; ambiguous Maven/Gradle roots require explicit
  selection instead of guessing;
- `.java-version` controls Java base image policy when present, otherwise the planner uses the
  default Java version policy;
- Spring Boot evidence comes from Maven/Gradle dependencies/plugins, wrapper files, and
  deterministic jar metadata where available. Buildpack-style detection may add adapter-owned
  acceleration later, but it is not the only Spring Boot support path;
- runnable jar discovery is deterministic before `java -jar` is emitted. If a jar path cannot be
  selected from explicit profile, deterministic artifact naming, or exactly one safe jar evidence
  item, the planner requires an explicit production start command;
- explicit resource runtime profile commands win over inferred framework defaults and are the only
  fallback for unsupported frameworks or ambiguous JVM app/artifact targets;
- all successful plans produce Docker/OCI workspace image artifact intent with generated
  Dockerfile evidence, internal HTTP verification, and resource-owned network/health behavior;
- Spring Boot actuator evidence may default health to an actuator path. Non-actuator projects use
  the generic HTTP health default unless explicit resource health policy wins;
- unsupported, ambiguous, missing build tool, missing runnable jar, missing production start, and
  missing internal port cases return structured blocked reasons or `validation_error` in the
  governed phases instead of guessing.

## Planner Selection

Planner selection order:

1. Explicit first-class Appaloft planner selection or accepted future runtime-profile hint, when a
   governing spec exists for that hint.
2. Explicit custom or container-native profile: Dockerfile, Docker Compose, prebuilt image, static
   strategy, or explicit install/build/start commands that make the source containerizable.
3. Framework-specific planners before generic language planners when no explicit profile owns the
   artifact path.
4. Generic language planners only when required install/build/start/package information can be
   derived or was supplied explicitly.
5. Buildpack accelerator candidate only after the explicit planner/profile and generic planner
   paths decline or block without an explicit user-selected plan.
6. Unsupported failure.

Explicit container-native strategies still win over inferred framework detection for artifact
construction. If a future explicit framework hint conflicts with an explicit container-native
artifact profile, planning must block with `requires-override` or `incompatible-source-strategy`
instead of silently picking one.

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
| Buildpack accelerator is disabled, unavailable, ambiguous, or requires an unsupported builder/lifecycle feature | `validation_error` or preview blocked reason | `runtime-plan-resolution` or `runtime-target-resolution` | No |
| Image build/package fails after acceptance | `provider_error` or `infra_error` | `image-build` or `runtime-artifact-resolution` | Conditional |

Error details should include safe evidence fields such as `runtimeFamily`, `framework`,
`packageManager`, `projectName`, `plannerKey`, `baseImage`, `resourceSourceKind`,
`runtimePlanStrategy`, and detected file/script identifiers. Details must not include secret values
or unbounded command output.

### Runtime Plan Resolution Failure Contract

Unsupported, ambiguous, and missing planner evidence must use the shared runtime plan resolution
blocked-preview contract from
[Runtime Plan Resolution Unsupported/Override Contract](../specs/018-runtime-plan-resolution-unsupported-override-contract/spec.md).

The canonical support tiers are:

- `first-class`
- `explicit-custom`
- `container-native`
- `buildpack-accelerated`
- `unsupported`
- `ambiguous`
- `requires-override`

The canonical shared reason codes are:

- `unsupported-framework`
- `unsupported-runtime-family`
- `ambiguous-framework-evidence`
- `ambiguous-build-tool`
- `missing-build-tool`
- `missing-start-intent`
- `missing-build-intent`
- `missing-internal-port`
- `missing-source-root`
- `missing-artifact-output`
- `unsupported-runtime-target`
- `unsupported-container-native-profile`

Blocked preview output must include `phase`, `reasonCode`, `message`, safe `evidence`, `fixPath`,
`overridePath`, and optional `affectedProfileField`. Existing family-specific reasons such as
`ambiguous-jvm-build-tool`, `missing-jvm-build-tool`, `missing-runnable-jar`,
`missing-asgi-app`, or `ambiguous-python-app-target` may remain as evidence/detail codes only when
they also map to the shared reason code.

Explicit override rules are shared by every planner family:

- explicit install/build/start commands win over inferred commands;
- explicit Dockerfile, Compose, and prebuilt image profiles win over framework and buildpack
  evidence;
- explicit `ResourceNetworkProfile.internalPort` wins over detected/default port hints;
- explicit `ResourceSourceBinding.baseDirectory` wins over root-level ambiguous evidence;
- explicit resource health policy wins over planner or buildpack health hints.

Static application shapes default to the Appaloft static server on internal port `80`. Serverful
HTTP and SSR shapes block with `missing-internal-port` when no persisted or deterministic resource
network port exists.

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
- `generic-asgi`;
- `generic-wsgi`;
- generic `python` explicit-command fallback;
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
- local Python detection for FastAPI, Django, Flask, `uv`, Poetry, pip, lockfiles, `manage.py`,
  generic ASGI/WSGI entrypoint files, and explicit-command fallback evidence;
- local Java project detection;
- fixed-version fixture coverage for Next.js, Vite, Angular, SvelteKit, Nuxt, Astro, Remix,
  Express, Fastify, NestJS, Hono, Koa, generic Node package scripts, FastAPI, Django, Flask,
  deterministic generic ASGI, deterministic generic WSGI, Poetry Python web projects, and explicit
  Python start fallback source inspection;
- Vite, React SPA, Vue SPA, Svelte SPA, Solid SPA, Angular, Astro, Nuxt generate, Next.js
  standalone/static export, and SvelteKit adapter-static artifact planning.
- Node API framework and generic package-script fixtures plan through the generic Node workspace
  image planner with framework metadata, `serverful-http` application shape, package-manager
  policy, base-image policy, install/build/start command metadata, generated Dockerfile assertions,
  and structured `runtime-plan-resolution` errors when production start evidence is missing.
- SvelteKit ambiguous auto planning is rejected unless the workflow selects static explicitly or
  provides an explicit start command.
- JavaScript/TypeScript tested catalog closure has stable rows for Next.js SSR/standalone/static
  export, Remix, Nuxt generate, SvelteKit static/ambiguous mode, Astro static, Vite/React/Vue/
  Svelte/Solid/Angular SPA, Express/Fastify/NestJS/Hono/Koa, generic package scripts, missing
  evidence, and internal-port behavior. These rows are bound to fixture planner tests and
  `deployments.plan/v1` preview contract tests. Full real Docker/SSH execution for every fixture is
  still a migration gap, distinct from the headless Docker/OCI catalog closure.
- Python tested catalog closure has stable rows for FastAPI with `uv`, Django with
  pip/requirements, Flask with pip/requirements, deterministic generic ASGI, deterministic generic
  WSGI, Poetry, explicit start-command fallback, package-tool precedence, missing ASGI/WSGI app
  target, ambiguous app target, missing production start, and internal-port behavior. These rows
  are bound to source-inspection tests, fixture planner tests, headless Docker/OCI smoke assertions,
  and `deployments.plan/v1` preview contract tests. Full real Docker/SSH execution for every Python
  fixture and deeper Django collectstatic/static handling remain migration gaps.
- JVM/Spring Boot tested catalog closure has stable rows for Spring Boot Maven with wrapper, Spring
  Boot Maven without wrapper, Spring Boot Gradle with wrapper, Spring Boot Gradle Kotlin DSL,
  generic JVM explicit start-command fallback, generic deterministic jar fallback, unsupported JVM
  framework evidence, ambiguous Maven/Gradle build-tool evidence, missing JVM build tool, missing
  runnable jar, actuator health defaults, and internal-port behavior. These rows are bound to
  source-inspection tests, fixture planner tests, headless Docker/OCI smoke assertions, and
  `deployments.plan/v1` preview contract tests. Full real Docker/SSH execution for every JVM
  fixture and Quarkus/Micronaut planners remain migration gaps.
- Buildpack accelerator preview guardrails have stable rows for precedence, support tier, builder
  policy, limitations, unsupported/ambiguous/missing evidence, internal-port behavior, and
  `deployments.plan/v1` ready/blocked parity. Executable coverage is currently contract-level with
  hermetic preview payloads; real `pack`/lifecycle execution is not wired.
- Runtime plan resolution unsupported/override guardrails now have a Phase 5 feature artifact and
  stable matrix rows for shared support tiers, reason codes, blocked preview shape, fix paths,
  override paths, static default port behavior, explicit custom/container-native precedence,
  buildpack non-winning behavior, and future MCP/tool metadata parity. Code coverage should reuse
  hermetic fake resolver/planner fixtures and must not wire real Docker/buildpack execution in this
  slice.

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
