# ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary

Status: Accepted

Date: 2026-04-14

## Decision

Reusable source, build, runtime, health, and access-route defaults belong to the Resource side of the domain model, not to the Deployment aggregate.

`deployments.create` creates one deployment attempt. It consumes the source/runtime/network profile owned by `Resource` and persists only the resolved deployment attempt snapshot.

The target domain vocabulary is:

- `SourceLocator`: an entry input pointer used to detect or resolve a source descriptor.
- `SourceDescriptor`: the normalized source fact used by runtime planning.
- `ResourceSourceBinding`: durable reusable, source-kind-specific configuration owned by the
  resource lifecycle.
- `ResourceRuntimeProfile`: durable reusable build, start, and health defaults owned by the resource lifecycle.
- `ResourceNetworkProfile`: durable reusable workload endpoint configuration, including the internal application listener port, governed by [ADR-015](./ADR-015-resource-network-profile.md).
- `DefaultAccessDomainPolicy`: provider-neutral policy for generated default public access, governed by [ADR-017](./ADR-017-default-access-domain-and-proxy-routing.md).
- `RuntimePlanStrategy`: the planning strategy used to resolve a runtime plan from a source and runtime profile.
- `RuntimePlanSnapshot`: the immutable resolved runtime plan persisted by the deployment attempt.
- `RuntimeArtifactSnapshot`: the provider-neutral image or Compose artifact identity resolved for
  one v1 deployment attempt, governed by [ADR-021](./ADR-021-docker-oci-workload-substrate.md).

`deploymentMethod` is not a domain term. The domain term is `RuntimePlanStrategy`.

The target boundary is:

```text
Resource
  -> ResourceSourceBinding
  -> ResourceRuntimeProfile
  -> ResourceNetworkProfile
  -> ResourceAccessProfile or DomainBinding references

Deployment
  -> DeploymentAttempt
  -> EnvironmentSnapshot
  -> RuntimePlanSnapshot
```

`Deployment` must persist the resolved runtime plan, resolved network snapshot, and environment snapshot used by the attempt. It must not become the long-term source of truth for reusable source binding, build commands, start commands, internal listener port, health-check policy, domain names, proxy policy, or TLS policy.

## Context

`CreateDeploymentCommand` currently accepts fields such as:

- `source`;
- `deploymentMethod`;
- `installCommand`;
- `buildCommand`;
- `startCommand`;
- `port`;
- `healthCheckPath`;
- `proxyKind`;
- `domains`;
- `pathPrefix`;
- `tlsMode`.

These fields are useful for first-deploy bootstrap and one-off runtime plan resolution, but they mix several different domain concepts under one deployment command.

The platform now has an accepted explicit `resources.create` minimum lifecycle. That command intentionally creates only the resource profile. The next resource lifecycle slices need a clear boundary for where reusable deployment configuration belongs.

## Options Considered

### Option A: Keep All Runtime Configuration On `deployments.create`

This keeps the current API shape and lets deployment bootstrap continue to create resources and runtime plans in one step.

This option is rejected as the target boundary because it makes deployments own reusable configuration and keeps Quick Deploy as an implicit resource-configuration path.

### Option B: Move All Existing Fields Into `resources.create`

This would make `resources.create` accept source, build, runtime, health, route, TLS, and domain configuration in one command.

This option is rejected because `resources.create` is governed by ADR-011 as a minimum profile creation command. Expanding it would mix source binding, runtime profile, health policy, route policy, and TLS lifecycle into the first resource slice.

### Option C: Introduce Explicit Resource Configuration Operations And Keep Deployment Overrides Transitional

This keeps `resources.create` minimal, introduces future resource-side operations for durable configuration, and allows `deployments.create` to carry one-shot overrides only until callers and runtime planning are migrated.

This option is superseded by [ADR-014](./ADR-014-deployment-admission-uses-resource-profile.md).

### Option D: Use Resource Source/Runtime Profile For Deployment Admission

This lets first-deploy resource creation persist source/runtime/network profile and makes `deployments.create` consume that profile.

This option is accepted by [ADR-014](./ADR-014-deployment-admission-uses-resource-profile.md).

## Chosen Rule

`resources.create` owns the durable resource profile. When a first-deploy workflow creates a resource, it may persist the resource source binding and runtime profile required for deployment planning.

Resource source configuration is a discriminated variant model. The source kind determines which
source fields are meaningful; entrypoints must not persist a single opaque URL as the only contract
when the URL contains additional source-selection semantics.

The core domain owns value objects for normalized source identity and source-tree selection. Those
value objects validate pure domain invariants such as cloneable repository locator shape, safe
source-root-relative base directories, Docker image tag/digest exclusivity, and absence of secret
material in stored source metadata.

Provider-aware or environment-aware conversion from a user-entered locator into normalized source
state belongs outside the aggregate. Web, CLI, API, application services, and integration adapters
may parse convenience locators, query provider branch/tag APIs, inspect local workspaces, or detect
files. They must dispatch `resources.create` with canonical source fields. `Resource` and
`ResourceSourceBinding` must not reach out to GitHub, the filesystem, Docker, or any provider to
guess meaning from a raw string.

Repository deployment config files are one entry-workflow source for these resource profile fields.
They are not durable Appaloft identity records. A committed config file may help produce
`ResourceSourceBinding`, `ResourceRuntimeProfile`, `ResourceNetworkProfile`, health policy, and
non-secret environment-variable command inputs, but it must not choose the Appaloft project,
resource, server, destination, credential, organization, or secret store that receives a deployment.
Those identities are resolved from explicit entrypoint input, trusted Appaloft link/source state,
safe source fingerprints, first-run auto-creation, or interactive operator choice outside the file.

Changing a committed repository config file must therefore not silently move future deployments to a
different project or resource. If an existing resource differs from profile fields in the file, an
entry workflow must apply the difference through explicit accepted resource configuration
operations, or reject the deployment as profile drift until those operations exist.

The initial source variants are:

| Source kind | Durable source binding fields | Runtime profile relationship |
| --- | --- | --- |
| Git sources (`remote-git`, `git-public`, `git-github-app`, `git-deploy-key`, `local-git`) | Repository or local Git locator, provider/repository identity when available, optional `gitRef`, optional `commitSha`, optional `baseDirectory`, and non-secret credential/provider references. | Runtime strategy selects how the checked-out source tree is planned. Dockerfile, Compose, static, or workspace command details belong to runtime profile fields. |
| Local folder | Local path locator plus optional `baseDirectory` relative to that folder. | Runtime strategy and build/start/static/compose/Dockerfile fields describe how that folder is planned. |
| Docker image | Image repository/name plus tag or digest parsed from the image reference. Tags and digests are source identity, not Git metadata. | Runtime strategy is `prebuilt-image`; build commands, Dockerfile path, and Compose path do not apply. |
| Dockerfile or Compose inline/source file variants | Locator or inline content pointer plus file-path metadata needed to materialize the supplied file. | Runtime strategy is `dockerfile` or `docker-compose`; source tree base directory applies only when the file is attached to a source tree. |
| Zip artifact | Artifact locator plus optional extraction/base directory metadata. | Runtime strategy determines whether extracted content is planned as Dockerfile, static, or workspace commands. |

GitHub browser URLs with a `tree` path are accepted only as entry convenience locators. For example,
`https://github.com/coollabsio/coolify-examples/tree/v4.x/bun` must normalize before persistence to
repository source plus source-selection metadata:

```ts
{
  kind: "git-public",
  locator: "https://github.com/coollabsio/coolify-examples",
  metadata: {
    gitRef: "v4.x",
    baseDirectory: "/bun",
    originalLocator: "https://github.com/coollabsio/coolify-examples/tree/v4.x/bun"
  }
}
```

When a Git branch or tag name can contain slashes, entrypoints must prefer a provider-backed branch
or tag lookup and choose the longest valid ref prefix before assigning the remaining path to
`baseDirectory`. If the ref/path split cannot be proven, non-interactive callers must provide
explicit `gitRef` and `baseDirectory` fields or receive a validation error instead of guessing.

`baseDirectory` is the source-tree root used by detection and build/runtime planning. It is a
resource source binding field because Git, local folder, and artifact sources can all have a
source-root selection before any runtime strategy is chosen.

Strategy-specific file paths are runtime profile fields. Dockerfile path, Docker Compose file path,
static publish directory, Docker build target, install/build/start commands, and health-check
defaults describe how the normalized source tree is planned. They must be combined with the
source binding's `baseDirectory` during runtime plan resolution, not stored as deployment attempt
input.

Framework/runtime detection is planning evidence over the normalized source tree. Package/project
name, framework, runtime family, package manager or build tool, runtime version, detected scripts,
lockfiles, static output, and base-image policy must feed `SourceInspectionSnapshot` and workload
planner output. They must not become `deployments.create` fields or untyped resource metadata when
they affect planning.

Reusable source configuration must be modeled by a future explicit resource source operation, for example `resources.bind-source` or `resource-source-bindings.create`.

Reusable build/runtime/health configuration must be modeled by a future explicit resource runtime-profile operation, for example `resources.configure-runtime`.

Reusable workload network endpoint configuration must follow [ADR-015](./ADR-015-resource-network-profile.md). The internal application listener port belongs to `ResourceNetworkProfile`, not to deployment admission.

Reusable domain/routing/TLS lifecycle remains governed by ADR-002 and the routing/domain/TLS command set:

- durable domains belong to `domain-bindings.create`;
- certificate lifecycle belongs to certificate commands;
- proxy bootstrap belongs to server/proxy lifecycle commands and events;
- generated default access is resolved through provider-neutral policy/adapters governed by ADR-017;
- deployment route snapshots are resolved from resource, domain binding, server/proxy, and default access policy state.

`deployments.create` must not keep source, runtime, health, route, domain, or TLS configuration fields as public command input. Its deployment-specific input is the deployment context id set governed by [ADR-014](./ADR-014-deployment-admission-uses-resource-profile.md).

New domain code and new specs must use the domain terms above. They must not introduce additional fields named as if `Deployment` owns source binding, runtime profile, health policy, domain binding, or TLS policy.

`SourceDescriptor.kind` and `RuntimePlanStrategy` are not synonyms. A runtime planner may derive a default strategy from the source descriptor, but an explicit strategy override must be validated against the source descriptor and rejected as a command-admission error when the pair cannot produce a valid runtime plan.

For v1, a valid `RuntimePlanStrategy` must produce or reference Docker/OCI-backed runtime artifacts
as governed by [ADR-021](./ADR-021-docker-oci-workload-substrate.md). Buildpack-style `auto`,
workspace-command, Dockerfile, static, Docker Compose, and prebuilt-image strategies are different
ways to produce or reference image/container artifacts; they are not permission to run arbitrary
long-lived host processes as the deployment substrate.

Any future redeploy command must prefer the resource-side durable profile plus explicit redeploy overrides accepted by that command. Existing latest deployment snapshots may be used only as a migration fallback for resources that predate profile persistence.

## Consequences

The model separates four concepts:

- Resource profile: durable deployable unit identity and ownership.
- Resource configuration: reusable source/runtime/network/health/access defaults.
- Deployment attempt: a single accepted execution request.
- Deployment snapshot: immutable runtime plan and environment snapshot used by one attempt.

Deployment bootstrap can remain as a compatibility seam while the first resource operations are implemented.

Future implementation must not add more reusable configuration fields to `deployments.create`. New durable configuration belongs to explicit resource, domain-binding, certificate, or server/proxy operations.

## Governed Specs

- [resources.create Command Spec](../commands/resources.create.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [Quick Deploy Workflow Spec](../workflows/quick-deploy.md)
- [Resource Create And First Deploy Workflow Spec](../workflows/resources.create-and-first-deploy.md)
- [Repository Deployment Config File Bootstrap Workflow Spec](../workflows/deployment-config-file-bootstrap.md)
- [Workload Framework Detection And Planning Workflow Spec](../workflows/workload-framework-detection-and-planning.md)
- [Deployment Config File Test Matrix](../testing/deployment-config-file-test-matrix.md)
- [Deployment Config File Implementation Plan](../implementation/deployment-config-file-plan.md)
- [resources.create Implementation Plan](../implementation/resources.create-plan.md)
- [ADR-014: Deployment Admission Uses Resource Profile](./ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-015: Resource Network Profile](./ADR-015-resource-network-profile.md)
- [ADR-017: Default Access Domain And Proxy Routing](./ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-020: Resource Health Observation](./ADR-020-resource-health-observation.md)
- [ADR-021: Docker/OCI Workload Substrate](./ADR-021-docker-oci-workload-substrate.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Domain Model](../DOMAIN_MODEL.md)

## Superseded Open Questions

- Should `deploymentMethod`, source descriptor, install/build/start commands, internal port, and health-check path be modeled as deployment command fields or resource configuration?
- Should the internal application listener port stay in `ResourceRuntimeProfile` or move to `ResourceNetworkProfile`?
- Should deployment routing/TLS fields be moved directly to `resources.create`?
- Should `Deployment` keep reusable resource configuration, or only the resolved runtime plan snapshot for an attempt?

## Current Implementation Notes And Migration Gaps

Current `CreateDeploymentCommand` has moved to the ids-only command shape governed by ADR-014.

Current `DeploymentContextBootstrapService` can create or reuse resources during deployment admission.

Public redeploy behavior is removed from the v1 deployment command surface by [ADR-016](./ADR-016-deployment-command-surface-reset.md). Any future redeploy behavior must rebuild its own command spec, workflow, test matrix, and resource-profile snapshot rules before re-entering the public Web/API/CLI surface.

Resource-side source binding, runtime profile, and network profile persistence are being introduced through the first-deploy `resources.create` path. Dedicated update/configuration commands remain future work.

Current code stores the resource listener port as `ResourceNetworkProfile.internalPort`.

Current resource health observation is governed by ADR-020. Deployment-time health verification may
remain an attempt execution concern, but reusable health policy and current health status belong to
the resource profile/read-model side of the boundary.

Current code has explicit source value objects and command/schema fields for the initial Git and
Docker image source variants. Runtime planning still carries source variant values through source
descriptor metadata, and strategy-specific runtime-profile fields such as Dockerfile path, Compose
path, static publish directory, and build target still need explicit value objects before dedicated
update operations are exposed.

Current repository config file support still uses a legacy identity-bearing schema and does not yet
follow the config-file bootstrap workflow. That schema must be narrowed before repository config
support can be considered aligned with this ADR.

Generated default access policy/provider resolution remains future implementation work governed by ADR-017.

## Open Questions

- What exact operation names should be used for resource source binding and resource runtime profile configuration?
