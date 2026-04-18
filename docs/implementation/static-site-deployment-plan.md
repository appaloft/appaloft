# Static Site Deployment Implementation Plan

## Source Of Truth

This document is an implementation-planning contract for first-class static site deployment. It
does not replace ADRs, command specs, event specs, workflow specs, error specs, or test matrices.

Static site deployment is a workflow over existing public operations:

```text
resources.create(kind = static-site, runtimeProfile.strategy = static, publishDirectory, networkProfile.internalPort = 80)
  -> deployments.create(resourceId)
```

It is not a new public command, Quick Deploy command, provider-specific static hosting shortcut, or
non-container runtime substrate.

## ADR Need Decision

No new ADR is required for the minimal static site deployment behavior. Existing accepted ADRs
already govern the behavior:

- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md) places static publish directory in `ResourceRuntimeProfile`.
- [ADR-014: Deployment Admission Uses Resource Profile](../decisions/ADR-014-deployment-admission-uses-resource-profile.md) keeps `deployments.create` ids-only.
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md) makes the static server listener port resource-owned.
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md) keeps generated access provider-neutral and out of deployment input.
- [ADR-021: Docker/OCI Workload Substrate](../decisions/ADR-021-docker-oci-workload-substrate.md) requires static sites to package output into a Docker/OCI static-server artifact.
- [ADR-023: Runtime Orchestration Target Boundary](../decisions/ADR-023-runtime-orchestration-target-boundary.md) keeps runtime backend selection internal to the deployment target boundary.

A new ADR is required before adding non-container static hosting, CDN/object-storage publication,
custom static server image selection as public input, route/domain/TLS ownership changes, SPA
fallback policy, cache-header policy, or any new public operation.

## Governed Specs

- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [resources.create Command Spec](../commands/resources.create.md)
- [resource-created Event Spec](../events/resource-created.md)
- [Resource Lifecycle Error Spec](../errors/resources.lifecycle.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [deployments.create Workflow Spec](../workflows/deployments.create.md)
- [deployments.create Error Spec](../errors/deployments.create.md)
- [Resource Create And First Deploy Workflow Spec](../workflows/resources.create-and-first-deploy.md)
- [Quick Deploy Workflow Spec](../workflows/quick-deploy.md)
- [resources.create Test Matrix](../testing/resources.create-test-matrix.md)
- [deployments.create Test Matrix](../testing/deployments.create-test-matrix.md)
- [Quick Deploy Test Matrix](../testing/quick-deploy-test-matrix.md)
- [Deployment Runtime Substrate Plan](./deployment-runtime-substrate-plan.md)

## Target Contract

Entry workflows collect or infer a static site draft and dispatch `resources.create` with:

- `kind = "static-site"`;
- a normalized `ResourceSourceBinding`;
- `runtimeProfile.strategy = "static"`;
- `runtimeProfile.publishDirectory` as a source-root-relative output directory;
- optional install/build commands when the static output must be generated before packaging;
- `networkProfile.internalPort = 80`, `upstreamProtocol = "http"`, and
  `exposureMode = "reverse-proxy"` by default.

`publishDirectory` is relative to the selected source base directory after optional install/build
commands. It must not contain `..`, shell metacharacters, a URL, or host absolute path semantics.

`deployments.create` remains ids-only. During admission/planning it resolves the selected resource
profile into a static Docker/OCI artifact intent, then the runtime path packages the publish
directory into an adapter-owned static-server image and serves it over the resource network profile.

Generated access, proxy route status, logs, diagnostics, and resource health are observed through
the existing read-model/query surfaces. They are not static deployment command input.

## Expected Implementation Shape

Core should add or normalize explicit value objects and union members for:

- `RuntimePlanStrategy = "static"`;
- `StaticPublishDirectory`;
- static runtime artifact intent metadata on the deployment snapshot when needed;
- source-root-relative path validation shared with other runtime-profile path fields.

Application code should:

- accept `static` in resource runtime profile schemas;
- validate `publishDirectory` during `resources.create` as `resource-runtime-resolution`;
- reject historical static resources without a publish directory during `deployments.create` as
  `runtime-plan-resolution` or `runtime-artifact-resolution`;
- keep transport input schemas shared with command/query schemas;
- keep `deployments.create` ids-only.

Runtime adapters should:

- resolve the source base directory and publish directory safely;
- run optional install/build command leaves before packaging when present;
- package the resolved publish directory into a Docker/OCI image using an adapter-owned static
  server implementation;
- start the static server on the resource network profile endpoint, normally internal port 80;
- preserve resource-scoped cleanup and replacement semantics.

Web and CLI entrypoints should expose static site fields as entry-workflow draft state, then map
them to `resources.create`. They must not hardcode static behavior in Svelte components or dispatch
deployment command override fields.

## Touched Modules And Packages

Expected Code Round scope:

- `packages/core/src/workload-delivery`: runtime strategy and static publish directory value
  objects.
- `packages/core/src/release-orchestration`: static artifact snapshot or artifact intent where the
  deployment snapshot needs it.
- `packages/application/src/operations/resources`: create-resource schema, command factory, and use
  case validation.
- `packages/application/src/operations/deployments`: runtime plan resolution and structured errors
  for missing static publish directory.
- `packages/application/src/ports.ts`: deployment/runtime plan DTOs that currently enumerate
  runtime methods.
- `packages/adapters/runtime`: static artifact planner/packager and Docker/SSH execution path.
- `packages/contracts`, `packages/orpc`, `packages/adapters/cli`, and `apps/web`: shared schema
  exposure and Quick Deploy/static draft mapping.
- `packages/persistence/pg`: persistence/read-model fields only if typed static runtime profile or
  artifact snapshot fields require schema changes.

## Required Tests

The next Code Round must cover these matrix ids:

- `RES-CREATE-ADM-035`, `RES-CREATE-ADM-036`, `RES-CREATE-ADM-037`, and `RES-CREATE-WF-007`;
- `DEP-CREATE-ADM-026`, `DEP-CREATE-ADM-027`, and `DEP-CREATE-ASYNC-017`;
- `QUICK-DEPLOY-WF-040`, `QUICK-DEPLOY-WF-041`, and `QUICK-DEPLOY-ENTRY-008`.

Tests should include command/use-case coverage first, then shared Quick Deploy workflow coverage,
then adapter and opt-in Docker/SSH e2e coverage once the runtime path exists.

## Minimal Deliverable

The minimal Code Round deliverable is:

- `static` accepted as a resource runtime strategy;
- typed `publishDirectory` validation and persistence;
- static Quick Deploy Web/CLI draft mapping through `resources.create`;
- ids-only deployment admission resolving a static artifact intent;
- Docker/OCI static-server packaging and execution for local runtime;
- structured admission and post-acceptance errors for missing publish directory and static package
  failures;
- read/progress/log behavior consistent with existing deployment observation surfaces.

SPA fallback, cache headers, custom static server images, custom generated route policy, CDN
publication, object storage hosting, and domain/TLS convenience flows are follow-up behaviors.

## Current Implementation Notes And Migration Gaps

Current code has `static-site` resource kind, `RuntimePlanStrategy = static`,
`StaticPublishDirectory`, resource persistence/rehydration for `runtimeProfile.publishDirectory`,
shared contract/schema support, and HTTP/oRPC resource creation coverage for static resources.

Current deployment admission remains ids-only, reads the static resource runtime profile, rejects
missing publish directory before acceptance, resolves static artifact intent through the default
runtime plan resolver, and preserves `ok({ id })` while persisting failed deployment state for
post-acceptance static package failures.

Current shared Quick Deploy workflow tests cover static source/runtime/network id-threading and
missing-publish-directory stop points. Web QuickDeploy exposes static source/runtime draft fields,
and CLI deploy exposes equivalent `--method static`, `--publish-dir`, install/build, and port
flags that map to the shared `resources.create` command schema.

Current runtime execution backends generate adapter-owned static-server Dockerfiles for local and
generic-SSH Docker image builds. Local Docker static smoke coverage now verifies the generated
nginx image path against a real container, and generic-SSH Docker static smoke coverage exists as an
opt-in e2e harness gated by `APPALOFT_E2E_SSH_QUICK_DEPLOY=true`.

Existing Docker/OCI substrate work provides the boundary this behavior should extend. It must not
introduce raw host-process static serving or provider-specific deployment command input.

## Open Questions

- None for the minimal static site deployment behavior.
