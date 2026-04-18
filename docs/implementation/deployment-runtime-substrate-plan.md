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
- runtime instance identity: sanitized container ids, service names, and runtime network aliases
  when needed for logs, health, diagnostics, and cleanup;
- rollback candidate identity: previous successful runtime artifact and instance references when
  the adapter can preserve them safely;
- runtime command specs: structured command steps for Docker image build, container run, Compose
  lifecycle, Docker inspect/logs, cleanup, process invocation, and shell-script leaves. Rendered
  command strings are local/SSH executor output and should not be the planning API.
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
- `packages/core/src/workload-delivery`: ensure runtime profile strategies validate to
  containerizable artifact plans.
- `packages/application/src/operations/deployments`: resolve source/runtime/network profile into
  Docker/OCI artifact intent; preserve command input as ids-only.
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
- local Docker adapter starts and verifies a container with resource-scoped labels/names;
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

This Code Round introduced core runtime command spec types under
`packages/core/src/release-orchestration/runtime-command.ts` and adapter-side helpers under
`packages/adapters/runtime/src/runtime-commands` for builder and local/SSH shell rendering. Local
and generic-SSH Docker image build, Docker container run, Docker Compose up, and resource-scoped
container cleanup now flow through those specs before they are rendered to shell strings.

Compatibility command text for workspace install/build/start steps remains a shell-script leaf
until runtime profile command fields are modeled as command specs end to end.

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
