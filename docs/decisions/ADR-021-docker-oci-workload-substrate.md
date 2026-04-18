# ADR-021: Docker/OCI Workload Substrate

Status: Accepted

Date: 2026-04-16

## Decision

Appaloft v1 deployment execution is Docker/OCI-based.

Every successful v1 application deployment must either:

- build an OCI/Docker image from the resource source and runtime profile; or
- reference a prebuilt OCI/Docker image by tag or digest; or
- materialize a Docker Compose project whose runnable services are backed by OCI/Docker images.

The public business language remains `SourceDescriptor`, `ResourceRuntimeProfile`,
`RuntimePlanStrategy`, `RuntimePlanSnapshot`, `Deployment`, and `ResourceHealthSummary`.
Docker-native types such as container ids, image ids, Compose project names, Docker labels, and
Docker daemon responses are runtime-adapter details. They may be stored in sanitized deployment
snapshots, logs, diagnostics, and read models when needed for operation, but they must not become
transport input fields, aggregate invariants, or framework dependencies in core.

The accepted v1 runtime progression is:

```text
detect source
  -> plan containerizable runtime
  -> build or pull OCI/Docker image artifact
  -> start replacement container(s) or Compose project
  -> realize proxy route against the resource workload endpoint
  -> verify container/runtime health and public route when required
  -> finalize success or persist failure
  -> preserve rollback candidate metadata for future rollback operations
```

`RuntimePlanStrategy` describes how the source becomes a containerized runtime artifact:

| Strategy | v1 artifact rule |
| --- | --- |
| `prebuilt-image` | Use the parsed image reference from `ResourceSourceBinding`; prefer digest-pinned deployment snapshots when available. |
| `dockerfile` | Build an OCI/Docker image from the resolved source root, Dockerfile path, and Docker build options. |
| `docker-compose` | Materialize a Compose project; each service must use or build OCI/Docker images, and the resource network profile must identify the public target service when needed. |
| `auto` | Detect a supported buildpack-style plan, such as Nixpacks, Railpack, Cloud Native Buildpacks, or a generated Dockerfile, that produces an OCI/Docker image. |
| `workspace-commands` | Package the workspace command model into an OCI/Docker image instead of running arbitrary long-lived host processes directly. |
| `static` | Package static output into an OCI/Docker image, for example an Nginx or equivalent static-serving image, unless a future ADR accepts a non-container static-hosting runtime. |

Direct host-process runtimes such as PM2, systemd services, bare binaries, or language-specific
process managers are not v1 public workload runtime strategies. A future non-Docker runtime may be
added only through a new ADR and local specs that define its artifact, rollout, health, log,
rollback, and cleanup semantics.

This ADR defines the workload artifact substrate, not a permanent single-node Docker-only
orchestration model. Runtime target selection and future Docker Swarm or Kubernetes execution
backends are governed by
[ADR-023: Runtime Orchestration Target Boundary](./ADR-023-runtime-orchestration-target-boundary.md).
Those target backends must consume the same OCI/Docker artifact and resource network/access
contracts instead of adding provider-specific fields to `deployments.create`.

## Context

The project goal already models deployment as:

```text
detect -> plan -> execute -> verify -> rollback
```

The unresolved question was whether "execute" should be generic host process execution or a
containerized runtime substrate. Current self-hosted PaaS prior art strongly converges on
image/container units even when the user does not provide a Dockerfile:

- Coolify documents that it deploys all applications as Docker containers, and build packs
  transform source code into Docker images. It also limits rollbacks to locally available Docker
  images.
- Dokku accepts Git, Dockerfile, buildpack, Nixpacks/Railpack, and image-based deployment methods,
  but the scheduler/runtime surface is Docker/container oriented; remote operation is commonly
  driven over SSH.
- CapRover describes itself as a thin layer around Docker that uses Docker API to build and run
  applications, with Docker Swarm health checks and update strategies.
- Kamal deploys to servers over SSH by building/pushing/pulling Docker images and rolling app
  containers. Its rollback command starts a new container from a previous image/container version.

This does not mean every self-hosted deployment tool in the world is Docker-based. It means the
tools closest to Appaloft's v1 goal use image/container identity as the operational unit for rollout,
rollback, health, logs, proxy routing, cleanup, and diagnostics.

## Options Considered

### Option A: Make Docker Types The Public Platform Contract

This would expose image names, container ids, Docker labels, Compose project names, and Docker
daemon options directly through commands and transports.

This option is rejected because it would leak infrastructure details into core, application, Web,
CLI, API, and future MCP contracts.

### Option B: Keep Runtime Execution Fully Runtime-Agnostic In v1

This would allow Docker, PM2, systemd, raw host commands, and provider-native runtimes to compete
as first-class v1 execution substrates.

This option is rejected for v1 because rollout, rollback, log, health, proxy, cleanup, and
diagnostic semantics would remain under-specified. The first production loop needs one coherent
runtime substrate.

### Option C: Use Docker/OCI As The v1 Substrate Behind Provider-Neutral Contracts

This makes image/container identity the v1 runtime implementation baseline while keeping public
business contracts provider-neutral.

This option is accepted.

## Chosen Rule

`deployments.create` resolves the resource-owned source/runtime/network profile into a
containerized `RuntimePlanSnapshot`.

For buildable sources, the workflow must request or perform an image build/package step before
runtime rollout starts. `build-requested` means an image artifact is requested for an accepted
deployment attempt. It does not mean the image has been built, pushed, pulled, or started.

For prebuilt image sources, `build-requested` is skipped unless future specs introduce an explicit
artifact verification event. The deployment snapshot should still record safe image identity, such
as image name, tag, digest, and the resolved local image id when available.

Runtime rollout starts only after the required image artifact exists or the prebuilt image has been
resolved enough for the runtime adapter to start it.

Runtime adapters may execute Docker locally, over SSH, or through another Docker-compatible
executor. The application layer depends on injected ports and provider-neutral plan/result types;
it must not call Docker SDKs, shell commands, SSH commands, or Docker Compose directly.

Runtime/process commands are part of the runtime plan model, not free-form execution strings.
Planning code should produce typed command specifications, such as process invocation, shell-script
leaf, Docker image build, Docker container run, Docker Compose up/down, Docker inspect, or Docker
logs intent. The final shell command string is an adapter-rendered representation for a concrete
executor, such as local shell, SSH shell, or a future Docker API executor. The same command spec
must be able to render sanitized display text and executable text without leaking secret values.

Framework detection is a workload-planning concern. Planners may inspect package manifests,
lockfiles, framework config, runtime version files, build scripts, package/project names, static
output conventions, and Dockerfile/Compose files after a source has been normalized and
materialized. Those facts must be represented as typed `SourceInspectionSnapshot` evidence when
they affect planner selection, base image policy, install/build/start/package commands, or
diagnostics. The selected planner resolves a base image and Docker/OCI artifact intent behind the
resource/deployment contracts; framework name, package name, and base image must not become
`deployments.create` transport fields.

CQRS command messages and runtime command specifications are distinct concepts. A
`deployments.create` command asks the application to accept a deployment attempt. A runtime command
spec describes one adapter-executable step inside the accepted deployment workflow.

Proxy route realization must target the resource workload endpoint through Docker/container or
Compose network identity. Reverse-proxy exposure must not require a public host-published
application port.

Cleanup and replacement are resource-scoped:

- a new deployment may replace older runtime instance(s) for the same resource after the adapter's
  chosen rollout strategy says it is safe;
- reverse-proxy and route-mediated rollout strategies must keep the previous successful
  same-resource runtime serving until the replacement candidate passes required health, route, and
  public verification gates;
- failed replacement candidates must be cleaned up separately from superseded successful runtime
  instances;
- it must not stop another resource because it shares the same internal port, image, service name,
  or container label shape;
- Compose stack cleanup must use resource/deployment-scoped project identity, not global service
  name scans.

Rollback is not reintroduced as a public command by this ADR. ADR-016 still keeps
`deployments.rollback` out of the public Web/API/CLI surface until its own Spec Round. This ADR
only defines the substrate that makes a future rollback operation coherent:

- deployment snapshots must preserve enough previous runtime identity to construct a rollback
  candidate;
- successful deployments should retain the previous image/container or Compose project metadata
  according to retention policy;
- failed rollout rollback, when performed internally by an adapter to keep the previous resource
  instance alive, must be recorded as deployment execution state and diagnostics;
- a future public rollback command must create or reference a new deployment/rollback attempt
  rather than mutating historical deployment facts in place.

Persistent volumes and stateful Compose services are special cases. Container/image rollback does
not imply data rollback. Any future stateful rollback behavior needs a separate ADR or command
spec before user-facing claims are made.

## Consequences

The first v1 implementation can focus on Docker-compatible server targets:

- server readiness must include Docker availability when the selected runtime requires Docker;
- deployment runtime plans must resolve to image or Compose artifacts;
- runtime command construction must use typed command specifications and executor-specific
  renderers; shell strings are execution-boundary output, not the planning contract;
- deployment logs and diagnostics should include sanitized image/container/Compose context;
- resource runtime logs and health can use Docker/Compose readers first while keeping query
  contracts normalized;
- future rollback/redeploy work can target immutable deployment snapshots and image/container
  identities instead of reconstructing host-process state.

The following remain provider-neutral:

- command and query input schemas;
- core aggregate state and value object names;
- operation catalog keys;
- Web, CLI, API, and future MCP contracts;
- edge proxy provider interfaces;
- default access domain provider interfaces;
- resource health and runtime log query result shapes.

## Governed Specs

- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Domain Model](../DOMAIN_MODEL.md)
- [resources.create Command Spec](../commands/resources.create.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [deployments.create Workflow Spec](../workflows/deployments.create.md)
- [Workload Framework Detection And Planning Workflow Spec](../workflows/workload-framework-detection-and-planning.md)
- [Quick Deploy Workflow Spec](../workflows/quick-deploy.md)
- [Resource Create And First Deploy Workflow Spec](../workflows/resources.create-and-first-deploy.md)
- [deployment-requested Event Spec](../events/deployment-requested.md)
- [build-requested Event Spec](../events/build-requested.md)
- [deployment-started Event Spec](../events/deployment-started.md)
- [deployment-succeeded Event Spec](../events/deployment-succeeded.md)
- [deployment-failed Event Spec](../events/deployment-failed.md)
- [deployments.create Error Spec](../errors/deployments.create.md)
- [deployments.create Test Matrix](../testing/deployments.create-test-matrix.md)
- [Deployment Runtime Substrate Implementation Plan](../implementation/deployment-runtime-substrate-plan.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](./ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-014: Deployment Admission Uses Resource Profile](./ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-015: Resource Network Profile](./ADR-015-resource-network-profile.md)
- [ADR-016: Deployment Command Surface Reset](./ADR-016-deployment-command-surface-reset.md)
- [ADR-017: Default Access Domain And Proxy Routing](./ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-018: Resource Runtime Log Observation](./ADR-018-resource-runtime-log-observation.md)
- [ADR-020: Resource Health Observation](./ADR-020-resource-health-observation.md)
- [ADR-023: Runtime Orchestration Target Boundary](./ADR-023-runtime-orchestration-target-boundary.md)

## Research References

- [Coolify applications docs](https://coolify.io/docs/applications/index)
- [Coolify server introduction docs](https://coolify.io/docs/knowledge-base/server/introduction)
- [Coolify rolling updates docs](https://coolify.io/docs/knowledge-base/rolling-updates)
- [Dokku Docker image deployment docs](https://dokku.com/docs/deployment/methods/image/)
- [Dokku remote commands docs](https://dokku.com/docs/deployment/remote-commands/)
- [CapRover Docker Compose docs](https://caprover.com/docs/docker-compose.html)
- [CapRover zero downtime docs](https://caprover.com/docs/zero-downtime.html)
- [Kamal rollback docs](https://kamal-deploy.org/docs/commands/rollback/)
- [Kamal app command docs](https://kamal-deploy.org/docs/commands/app/)

## Current Implementation Notes And Migration Gaps

Current runtime adapters contain Docker/Compose-oriented behavior for local and generic SSH
execution, runtime logs, health checks, proxy labels/config, and container diagnostics.

The first Code Round introduced provider-neutral runtime artifact snapshots on `RuntimePlan` and
the deployment read/contract boundary for active resolver strategies. `workspace-commands` plans
now produce a Docker image artifact intent and generated-Dockerfile container execution plan rather
than a host-process runtime plan. The runtime adapter currently has a strategy-style workspace
planner registry for Next.js, Vite static, Astro static, Nuxt generate static, explicit SvelteKit
static, Remix, FastAPI, Django, Flask, generic Node, generic Python, generic Java, and custom
command plans. Local and generic-SSH Docker execution use the selected planner
metadata to generate the Dockerfile and build the workspace image or static-server image before
rollout. Source language/framework/package-manager evidence is represented by a typed
`SourceInspectionSnapshot`; planner selection must not depend on the generic
`SourceDescriptor.metadata` bag.

The target contract still has gaps:

- image artifact snapshots do not yet capture resolved image ids, digests, registry push/pull
  results, or previous runtime identity;
- runtime orchestration target selection is still single-server oriented, and target backend
  routing is not yet a dependency-injected registry keyed by target kind, provider key, and
  capabilities;
- project file analysis is still incomplete; source detection needs to populate richer typed
  inspection evidence for package manager locks, framework-specific build modes, static publish
  directories, Java artifact paths, and buildpack suitability;
- mainstream web framework support is incomplete. The target support catalog is governed by
  [Workload Framework Detection And Planning](../workflows/workload-framework-detection-and-planning.md).
  Current code widens the typed evidence vocabulary and implements initial JavaScript/TypeScript
  and Python framework slices, but many catalog entries still lack concrete detectors, planner
  implementations, Web/CLI draft parity, and Docker/SSH smoke coverage;
- `build-requested` is not yet published as a formal event;
- runtime execution still happens inside `deployments.create` instead of an acceptance-first
  process manager;
- runtime execution still contains legacy string command fields such as install/build/start command
  text for user-authored workspace steps. Docker build/run/Compose operations should migrate first
  to typed runtime command specs; compatibility string fields must not become the long-term command
  composition mechanism;
- Dockerfile, Compose, build target, and richer runtime-profile fields still need typed resource
  runtime-profile value objects. Static publish directory now has a dedicated runtime-profile value
  object for the first-class static site path;
- previous runtime identity and rollback candidate retention are not yet a complete public
  rollback contract;
- stateful volume and database rollback semantics remain out of scope.

## Open Questions

- What is the first retention policy for old image/container/Compose metadata used by future
  rollback?
- Should the first public rollback command create a new `deployments.create`-like deployment
  attempt, a separate `deployments.rollback` attempt, or a release-level rollback attempt?
- Which buildpack-style planner should be the first concrete `auto` image builder in the default
  runtime adapter?
