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
- [deployments.create Test Matrix](../testing/deployments.create-test-matrix.md)
- [Quick Deploy Test Matrix](../testing/quick-deploy-test-matrix.md)
- [Deployment Runtime Substrate Implementation Plan](../implementation/deployment-runtime-substrate-plan.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

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
| Framework | `nextjs`, `remix`, `nuxt`, `sveltekit`, `astro`, `vite`, `angular`, `express`, `fastify`, `nestjs`, `hono`, `django`, `flask`, `fastapi`, `rails`, `laravel`, `spring-boot`, `aspnet-core`, `phoenix`, `axum`. |
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

## Support Catalog

The target support catalog for mainstream web application deployment is:

| Family | Frameworks and app shapes | Default artifact rule |
| --- | --- | --- |
| JavaScript/TypeScript on Node or Bun | Next.js, Remix, Nuxt, SvelteKit, Astro, Vite apps, React/Vue/Svelte/Solid/Angular SPAs, Express, Fastify, NestJS, Hono, Koa, generic `package.json` apps | Build a Docker/OCI image with the detected package manager and framework-specific build/start/static output rules. Static output may use the static-server artifact path. |
| Static site generators | Vite static, SvelteKit static, Next static export, Nuxt generate, Astro static, Docusaurus, Hugo, Jekyll, generic `dist`/`build` output | Package the publish directory into an OCI static-server image. |
| Python | FastAPI, Django, Flask, generic ASGI/WSGI apps | Build a Docker/OCI image with detected Python package tooling and explicit or framework-derived start command. |
| Ruby | Rails, Sinatra/Rack, generic Ruby web apps | Build a Docker/OCI image with Bundler and explicit or framework-derived start command. |
| PHP | Laravel, Symfony, generic Composer/PHP-FPM apps | Build a Docker/OCI image using Composer and a PHP runtime/server profile. |
| Go | Go modules, Gin, Echo, Chi, Fiber, generic Go HTTP services | Build a Docker/OCI image with a compiled binary and runtime image. |
| Java/JVM | Spring Boot, Quarkus, Micronaut, generic Maven/Gradle web services | Build or package a jar/native artifact into a Docker/OCI image. |
| .NET | ASP.NET Core and generic .NET web apps | Build/publish into a Docker/OCI image with the selected .NET runtime. |
| Elixir | Phoenix and generic Plug/Cowboy apps | Build a release and package it into a Docker/OCI image. |
| Rust | Axum, Actix Web, Rocket, generic Rust HTTP services | Build a binary and package it into a Docker/OCI image. |
| Container-native | Dockerfile, Docker Compose, prebuilt image | Use the explicit Dockerfile, Compose project, or prebuilt OCI image strategy. Framework detection may add diagnostics but does not override explicit container intent. |

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
- generic `node`;
- `vite-static`;
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
- local JavaScript/TypeScript detection for common framework dependencies/config files and
  lockfiles;
- local Python detection for FastAPI, Django, Flask, `uv`, Poetry, pip, lockfiles, and `manage.py`;
- local Java project detection;
- Vite, Astro, Nuxt generate, and explicit SvelteKit static artifact planning.

The following are migration gaps before the mainstream support catalog is complete:

- add detectors for remaining non-JavaScript catalog families and richer package/project names,
  static output conventions, and framework config files across the support catalog;
- add planner implementations for the unsupported catalog entries instead of routing them through
  generic custom commands by accident;
- model base image policy as explicit planner output and test it per remaining framework family;
- add Web/CLI Quick Deploy parity for framework/runtime draft fields and manual fallback commands;
- add deployment and Quick Deploy matrix rows for each support tier before Code Round expands the
  implementation.

## Open Questions

- Which catalog entries should be active in the next Code Round versus documented as planned
  target support behind explicit custom-command fallback?
