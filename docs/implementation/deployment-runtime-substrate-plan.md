# Deployment Runtime Substrate Implementation Plan

## Source Of Truth

This document is an implementation-planning contract for the Docker/OCI-backed v1 deployment
substrate. It does not replace ADRs, command specs, event specs, workflow specs, error specs, or
test matrices.

## Governed ADRs

- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-014: Deployment Admission Uses Resource Profile](../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-021: Docker/OCI Workload Substrate](../decisions/ADR-021-docker-oci-workload-substrate.md)
- [ADR-023: Runtime Orchestration Target Boundary](../decisions/ADR-023-runtime-orchestration-target-boundary.md)

## Governed Specs

- [deployments.create Command Spec](../commands/deployments.create.md)
- [deployments.create Workflow Spec](../workflows/deployments.create.md)
- [deployments.create Error Spec](../errors/deployments.create.md)
- [deployments.create Test Matrix](../testing/deployments.create-test-matrix.md)
- [resources.create Command Spec](../commands/resources.create.md)
- [Quick Deploy Workflow Spec](../workflows/quick-deploy.md)
- [Resource Create And First Deploy Workflow Spec](../workflows/resources.create-and-first-deploy.md)
- [Workload Framework Detection And Planning Workflow Spec](../workflows/workload-framework-detection-and-planning.md)
- [Static Site Deployment Implementation Plan](./static-site-deployment-plan.md)
- [deployment-requested Event Spec](../events/deployment-requested.md)
- [build-requested Event Spec](../events/build-requested.md)
- [deployment-started Event Spec](../events/deployment-started.md)
- [deployment-succeeded Event Spec](../events/deployment-succeeded.md)
- [deployment-failed Event Spec](../events/deployment-failed.md)
- [Deployment Runtime Target Abstraction Workflow](../workflows/deployment-runtime-target-abstraction.md)
- [Runtime Target Abstraction Implementation Plan](./runtime-target-abstraction-plan.md)

## Expected Implementation Shape

The Code Round should introduce or normalize provider-neutral application DTOs for:

- runtime artifact intent: `build-image`, `prebuilt-image`, `compose-project`, or static-site image
  package intent;
- image identity: image name, optional tag, optional digest, and optional local image id;
- compose identity: resource/deployment-scoped project name, compose file snapshot identity, and
  target service name;
- requested runtime naming intent and effective runtime identity: optional requested runtime name
  from `ResourceRuntimeProfile.runtimeName` plus the derived effective Docker container or Compose
  project name used for one deployment attempt;
- runtime instance identity: sanitized container ids, service names, and runtime network aliases
  when needed for logs, health, diagnostics, and cleanup;
- rollback candidate identity: previous successful runtime artifact and instance references when
  the adapter can preserve them safely;
- runtime command specs: structured command steps for Docker image build, container run, Compose
  lifecycle, Docker inspect/logs, cleanup, process invocation, and shell-script leaves. Rendered
  command strings are local/SSH executor output and should not be the planning API.
- source inspection evidence: typed runtime family, framework, package manager/build tool,
  package/project name, runtime version, detected files, detected scripts, build output, static
  publish output, Dockerfile/Compose paths, and packaged artifact paths used for planner selection.
- framework/runtime planner descriptors: planner key, support tier, detection predicates, base
  image policy, install/build/start/package command specs, artifact output rules, and diagnostic
  warnings.
- runtime target backend descriptors: target kind, provider key, required capabilities, and
  normalized render/apply/verify/log/cleanup result shapes. Docker, Swarm, and Kubernetes render
  artifacts remain adapter-owned.

Core should own value objects only when they are stable domain concepts, such as image reference,
image digest, runtime artifact kind, compose service name, and runtime artifact snapshot id. Docker
SDK responses, Docker client handles, SSH process handles, and Compose command result shapes remain
adapter details.

## Touched Modules And Packages

Expected implementation scope:

- `packages/core/src/release-orchestration`: add or normalize runtime artifact snapshot value
  objects and deployment snapshot state.
- `packages/core/src/workload-delivery` and `packages/core/src/release-orchestration`: ensure
  runtime profile strategies and source inspection value objects validate to containerizable
  artifact plans without framework or provider dependencies in core.
- `packages/application/src/operations/deployments`: resolve source/runtime/network profile into
  Docker/OCI artifact intent; preserve command input as ids-only; derive effective runtime naming
  from the resource profile plus deployment/preview context.
- `packages/application/src/ports.ts` and `packages/application/src/tokens.ts`: keep runtime
  execution behind injected ports; add artifact builder/executor ports only when required; add
  target backend registry/backend ports before adding cluster runtime targets.
- `packages/adapters/runtime`: implement or wrap local and generic-SSH Docker/Compose build, pull,
  start, verify, logs, cleanup, and rollback-candidate capture as registered target backends.
- `packages/providers/edge-proxy-*`: consume provider-neutral route plans and render Docker/Compose
  compatible route metadata without becoming command input.
- `packages/persistence/pg`: persist new artifact and runtime-instance snapshot fields if the
  write-side state or read models need them.
- `packages/contracts`, `packages/orpc`, `packages/adapters/cli`, and `apps/web`: expose only
  provider-neutral read/diagnostic fields, never Docker-native command input.

## Framework Planner Contract

The runtime substrate must support mainstream web frameworks through an extensible planner registry
instead of hardcoding only Node/Bun/Next.js behavior. The target contract is defined in
[Workload Framework Detection And Planning](../workflows/workload-framework-detection-and-planning.md).

Planner registry requirements:

- each planner has a stable `plannerKey`, supported runtime family/framework values, and detection
  predicate;
- framework-specific planners run before generic language planners;
- explicit Dockerfile, Docker Compose, prebuilt image, and static strategies override inferred
  framework planners;
- generic language planners may run only when explicit commands or detected scripts are sufficient
  to build and start a containerized workload;
- planner output includes base image policy, install/build/start/package command specs, artifact
  output rules, and safe diagnostic metadata;
- source inspection uses typed values rather than generic metadata for fields that affect planner
  selection or Dockerfile generation;
- unsupported detected frameworks fail with structured `validation_error` in phase
  `runtime-plan-resolution` unless explicit custom commands make the plan containerizable.

The first expansion beyond the current implementation should prioritize framework families that
close common self-hosted web deployments:

- JavaScript/TypeScript: Vite/static SPA, SvelteKit, Nuxt, Astro, Remix, Angular, and generic Node
  HTTP frameworks in addition to Next.js;
- static site generation: framework static outputs and generic `dist`/`build` directories through
  the static-server image path;
- Python: FastAPI, Django, and Flask;
- Ruby/PHP/Go/Java/.NET/Elixir/Rust: at least one generic planner per family plus framework
  detection for Rails, Laravel/Symfony, common Go web services, Spring Boot, ASP.NET Core, Phoenix,
  and Axum/Actix/Rocket before those families are considered first-class.

Support for a planner family is not complete until Web/CLI Quick Deploy can either collect the
needed resource profile fields or require explicit fallback commands, and the deployment test
matrix has rows for detection, base image policy, command generation, artifact output, and
unsupported evidence.

## Runtime Flow

Required flow:

```text
deployments.create accepted
  -> deployment-requested
  -> select runtime target backend by target kind, provider key, destination, and capabilities
  -> build-requested when image build/package is needed
  -> build or pull image / materialize Compose project
  -> deployment-started
  -> target backend starts replacement runtime workload(s)
  -> target backend or edge proxy provider realizes route from route snapshot
  -> verify container/runtime health and public route when required
  -> deployment-succeeded or deployment-failed
```

The first implementation may still execute synchronously inside the use case as a migration gap,
but it must keep logs, events, state names, and tests aligned with the acceptance-first contract.

## Rollout And Rollback Candidate Rules

Runtime replacement must be resource-scoped:

- identify containers/projects using resource id, deployment id, and destination/server context;
- never remove another resource because it shares `internalPort`, image name, or service name;
- for reverse-proxy exposure, avoid public host-port requirements for application containers;
- for direct-port exposure, treat host port as a collision boundary and preserve the existing
  runtime on conflict.

Rollback candidate capture is internal substrate work, not public rollback behavior:

- capture previous successful artifact/instance identity before replacement when available;
- retain enough metadata to support a future rollback Spec Round;
- record adapter rollback/preserve failure as `deployment-failed` diagnostics;
- do not claim database, volume, or external dependency rollback.

## Required Tests

Required coverage:

- `auto` and `workspace-commands` produce image artifact intent, not host-process runtime plans;
- `dockerfile` builds from resolved source root and Dockerfile path;
- `prebuilt-image` snapshots image tag/digest and skips `build-requested`;
- `docker-compose` snapshots project identity, service images/build declarations, and target
  service name for inbound traffic;
- `static` snapshots source root, publish directory, optional build command leaves, static-server
  artifact intent, and HTTP endpoint metadata;
- source inspection detects safe package/project name, package manager/build tool, framework,
  runtime version, scripts, lockfiles, framework config, and build-output evidence without running
  untrusted project code;
- framework planners choose base image and install/build/start/package command specs from typed
  evidence, not from ad-hoc `SourceDescriptor.metadata`;
- mainstream framework planners cover the catalog in
  [Workload Framework Detection And Planning](../workflows/workload-framework-detection-and-planning.md)
  or fail with structured unsupported-planner errors and explicit custom-command fallback guidance;
- base image policy changes are covered per planner family;
- local Docker adapter starts and verifies a container with resource-scoped labels/names plus
  sanitized diagnostic labels for context names/kinds, runtime/source/artifact/route summaries,
  requested/effective runtime name, and preview identity when available;
- requested runtime names are validated and derived into unique effective runtime/container/project
  names so two resources or overlapping same-resource replacement attempts do not collide on exact
  Docker names;
- generic-SSH Docker adapter uses resolved server credentials and reports sanitized failures;
- same internal port on two reverse-proxy resources does not trigger cross-resource cleanup;
- direct host-port collision fails or rejects without stopping the existing resource;
- reverse-proxy same-resource replacement keeps the previous successful runtime serving until the
  candidate passes health, route, and public verification, and failed candidates are cleaned up
  without deleting that previous runtime;
- typed runtime command builder and renderer tests for Docker image build, Docker container run with
  env/labels/ports/network, Docker Compose up/down, resource-scoped cleanup, quoting, and redacted
  display output;
- container exits before verification records container state and recent logs;
- image build/pull failures produce `deployment-failed` with structured phase/details;
- previous runtime identity is captured as rollback-candidate metadata when available;
- public Web/API/CLI contracts do not accept Docker-native deployment input fields.
- public Web/API/CLI contracts do not accept framework-specific deployment fields such as
  framework, package name, base image, Kubernetes namespace, buildpack name, or runtime preset.
- target backend registry selects local and generic-SSH backends by provider key/capabilities
  without expanding transport input schemas;
- unsupported target/provider/capability combinations return structured `runtime-target-resolution`
  errors before acceptance when safely detectable.

## Minimal Deliverable

The minimal Code Round deliverable is:

- provider-neutral artifact snapshot types;
- deployment planning that maps each active runtime strategy to Docker/OCI artifact intent;
- runtime target backend registry wrapped around current local/generic-SSH/fake execution behavior;
- local and generic-SSH Docker execution paths for build or prebuilt image deployment;
- Compose deployment path for a single inbound target service when Compose is in scope;
- sanitized diagnostics for image build/pull/container start/health failures;
- resource-scoped cleanup and replacement;
- tests aligned with the deployment test matrix.

When static site deployment is in scope, the minimal deliverable also includes static artifact
planning and local Docker static-server packaging aligned with
[Static Site Deployment Implementation Plan](./static-site-deployment-plan.md).

Public rollback, redeploy, cancel, manual health check, stateful volume rollback, registry
retention policy editing, Docker Swarm, Kubernetes, and non-Docker runtime adapters remain
follow-up behaviors.

## Current Implementation Notes And Migration Gaps

Current runtime adapters contain Docker/Compose behavior for local and SSH execution, logs, health
checks, edge proxy plans, and diagnostics.

The first Code Round normalized the runtime plan boundary by adding provider-neutral
`runtimeArtifact` snapshots for image and Compose project intents, updating the persistence/read
contract boundary, and changing `workspace-commands` planning from host-process execution to a
generated-Dockerfile Docker image build. Workspace Dockerfile planning is now delegated to a
strategy-style planner registry under the runtime adapter so common runtimes can own their own
detect, base image, command, and Dockerfile template behavior. Planner selection now reads typed
`SourceInspectionSnapshot` evidence rather than generic `SourceDescriptor.metadata`.

Current `deployments.create` still awaits runtime execution inside the use case. The source-of-truth
contract remains acceptance-first and event/process-manager oriented.

Current local and SSH Docker runtime code still defaults effective workload/container names to
`appaloft-<deploymentId>` style values and image names to `appaloft-image-<deploymentId>` style
values. User-supplied resource runtime naming intent and preview-derived `preview-{pr_number}` seeds
remain a follow-up Code Round gap after this Spec Round.

This Code Round introduced core runtime command spec types under
`packages/core/src/release-orchestration/runtime-command.ts` and adapter-side helpers under
`packages/adapters/runtime/src/runtime-commands` for builder and local/SSH shell rendering. Local
and generic-SSH Docker image build, Docker container run, Docker Compose up, and resource-scoped
container cleanup now flow through those specs before they are rendered to shell strings.

Compatibility command text for workspace install/build/start steps remains a shell-script leaf
until runtime profile command fields are modeled as command specs end to end.

Current framework/runtime planning supports Next.js, Vite static, Astro static, Nuxt generate
static, explicit SvelteKit static, Remix, FastAPI, Django, Flask, generic Node, generic Python,
generic Java, and custom command fallback. Current typed source inspection has been widened for
the target catalog vocabulary, and local JavaScript/TypeScript detection recognizes common
framework dependencies/config files and package-manager lockfiles. Local Python detection now
recognizes FastAPI, Django, Flask, `uv`, Poetry, pip, lockfiles, and `manage.py`. The broader
mainstream framework catalog in the workflow spec remains target contract and requires future Code
Rounds for unsupported planner families and fixture-by-fixture real deployment smoke. Web, CLI, and
repository config now share the current JavaScript/TypeScript/Python draft vocabulary for resource
source, runtime, network, and health profile fields; full browser-level entry parity for every
catalog fixture remains a follow-up hardening gap.

The fixture deploy smoke slice is headless for CI portability. The current supported
JavaScript/TypeScript/Python fixture catalog now proves that the shared resource
source/runtime/network profile can flow through source inspection into Docker/OCI image artifact
intent, generated Dockerfile evidence, docker-container execution metadata, internal HTTP
verification steps, and typed Docker build/run-command rendering. This is equivalent smoke rather
than real Docker execution because the fixture contract avoids dependency installation and framework
CLI execution by default. Full real Docker/SSH smoke for every JavaScript/TypeScript/Python catalog
fixture remains a migration gap.

The first real fixture deployment smoke target is a representative opt-in local Docker slice, not
the full catalog: Vite or Next static export plus Angular SPA, React SPA, or SvelteKit static; Next
SSR or Remix plus one Node HTTP framework; and FastAPI plus Django or Flask when dependency
installation is available. If FastAPI cannot execute because the Docker package index cannot
resolve required dependencies, the local slice may temporarily use Django plus Flask only when the
FastAPI dependency failure remains recorded as a migration gap. The harness must start from the
same resource source/runtime/network profile vocabulary as Quick Deploy, dispatch ids-only
`deployments.create` or an equivalent shell workflow, then prove actual image build, container run,
internal HTTP verification, runtime metadata/logs, and typed command rendering. Generic-SSH should
reuse the same fixture descriptors when a real SSH target is configured; until then, real SSH
fixture execution remains a migration gap rather than a passed condition.

Current opt-in local Docker coverage for this slice passes with Vite SPA, React SPA, Next SSR,
Hono, Django, and Flask. FastAPI is still a migration gap in the current local Docker environment
because pip could not resolve the required transitive `pydantic` dependency for the fixture image.
Angular SPA and SvelteKit static remain fixture-hardening gaps for real Docker execution after
failing during dependency/build execution before container start. The headless planner/catalog
coverage for those fixtures remains intact.

JavaScript/TypeScript tested catalog closure now has stable fixture-specific rows for Next.js
SSR/standalone/static export, Remix, Nuxt generate, SvelteKit static and ambiguous mode, Astro
static, Vite/React/Vue/Svelte/Solid/Angular static SPA, Express/Fastify/NestJS/Hono/Koa, generic
package scripts, missing evidence, and internal-port behavior. Runtime fixture tests bind these
rows to source inspection, planner/base-image policy, command specs, artifact output, Dockerfile
generation intent, and headless Docker/OCI execution readiness. `deployments.plan/v1` contract
coverage proves the same catalog shape can be returned through the public read-only preview
without deployment execution.

`build-requested`, resolved image ids/digests, runtime instance identity, rollback candidate
capture, command specs on the durable runtime plan boundary, and richer source-file analysis are
not yet fully implemented across the application and persistence boundary. The remaining generic
source metadata fields should be narrowed to source-kind-specific typed state or adapter-only
diagnostics in follow-up rounds.

Static site deployment is partially implemented. Current code has a `static` runtime strategy path,
typed publish-directory validation at resource creation and deployment admission, static artifact
planning, post-acceptance failure mapping for static package errors, and adapter-owned static-server
Dockerfile generation for local/generic-SSH image builds. Local Docker static smoke coverage now
exercises generated nginx packaging and runtime verification, and generic-SSH Docker static smoke
coverage exists as an opt-in e2e harness for real SSH targets.

Runtime target abstraction is not implemented yet. Current execution routing still selects local
and generic-SSH behavior through provider-key checks rather than a registered backend descriptor and
capability lookup. Swarm and Kubernetes must not be added before that boundary exists.

## Open Questions

- Which old image/container retention policy should v1 use before public rollback exists?
- Should the first runtime artifact snapshot be write-side aggregate state, read-model state, or
  both?
- Should `auto` use Nixpacks, Railpack, Cloud Native Buildpacks, or a generated Dockerfile first?
