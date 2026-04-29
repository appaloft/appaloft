# Resource Create And First Deploy Workflow Spec

## Normative Contract

Resource creation and first deployment are two explicit business operations.

`resources.create` creates the durable resource profile. `deployments.create` creates the deployment attempt.

```text
resources.create
  -> resource-created
  -> deployments.create(resourceId)
```

The workflow may be used by Quick Deploy, CLI interactive deploy, API clients, automation, and future MCP tools. Entry points may collect input differently, but they must not collapse resource creation and deployment admission into one hidden command.

## Global References

This workflow inherits:

- [ADR-011: Resource Create Minimum Lifecycle](../decisions/ADR-011-resource-create-minimum-lifecycle.md)
- [ADR-010: Quick Deploy Workflow Boundary](../decisions/ADR-010-quick-deploy-workflow-boundary.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-014: Deployment Admission Uses Resource Profile](../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-024: Pure CLI SSH State And Server-Applied Domains](../decisions/ADR-024-pure-cli-ssh-state-and-server-applied-domains.md)
- [resources.create Command Spec](../commands/resources.create.md)
- [resource-created Event Spec](../events/resource-created.md)
- [Resource Lifecycle Error Spec](../errors/resources.lifecycle.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [Quick Deploy Workflow Spec](./quick-deploy.md)
- [Workload Framework Detection And Planning](./workload-framework-detection-and-planning.md)
- [Repository Deployment Config File Bootstrap](./deployment-config-file-bootstrap.md)
- [Resource Profile Drift Visibility](../specs/011-resource-profile-drift-visibility/spec.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## End-To-End Workflow

```text
user or automation intent
  -> collect/select project
  -> collect/select environment
  -> collect optional destination
  -> collect resource profile, source binding, runtime profile, and network profile
  -> resources.create
  -> observe resource id/read model
  -> deployments.create(resourceId)
  -> observe deployment progress/read model
```

`resources.create` success is complete when resource state is persisted. Deployment still requires `deployments.create`.

Source binding, runtime profile, and network profile are resource-owned inputs for first-deploy resource creation. Generated default access is resolved from platform policy, server/proxy readiness, and resource network state during deployment planning/execution. Durable custom domain/TLS defaults remain separate domain binding and certificate concerns.

A repository deployment config file may supply first-deploy source/runtime/network/health profile
defaults, but it must not be the source of project/resource/server/destination/credential identity.
When no trusted identity exists, the workflow may auto-create the project and resource from
source-derived defaults or operator input, then persist the resource profile through
`resources.create` before `deployments.create(resourceId)`.

If a resource already exists and the repository config profile has changed, the workflow must apply
the change through explicit resource/environment configuration operations as named workflow steps
when that mode is accepted, or fail with `resource_profile_drift` before deployment admission. It
must not smuggle the changed profile into `deployments.create`.

For v1, first-deploy runtime profile choices must produce a Docker/OCI image artifact or Docker
Compose project governed by [ADR-021](../decisions/ADR-021-docker-oci-workload-substrate.md). A
source without a Dockerfile still deploys through a generated/buildpack-style image plan, not a
long-lived host-process plan.

First-deploy resource creation does not configure the concrete runtime orchestrator. The selected
deployment target and destination choose the runtime target backend during `deployments.create`, as
governed by
[ADR-023: Runtime Orchestration Target Boundary](../decisions/ADR-023-runtime-orchestration-target-boundary.md).
Kubernetes namespaces, Helm values, Swarm stack fields, and other orchestrator-specific settings
must not be stored as generic resource runtime profile fields without a future target/profile Spec
Round.

The workflow must distinguish source selection from runtime planning. A selected source locator or source descriptor identifies what will be deployed. A runtime plan strategy describes how that source should be planned. The compatibility input name `deploymentMethod` may exist only at CLI/UI entry boundaries and must map to resource `RuntimePlanStrategy` before `resources.create`.

Source selection is variant-specific. Entry workflows may let a user paste a compact address such as
a GitHub tree URL, a local folder path, a Docker image reference, or a Compose file path, but the
workflow must normalize that draft before dispatching `resources.create`:

- Git repository drafts produce a cloneable repository locator plus `gitRef`, optional `commitSha`,
  optional `baseDirectory`, and provider/repository metadata when available.
- GitHub tree URLs such as
  `https://github.com/coollabsio/coolify-examples/tree/v4.x/bun` are not persisted as clone
  locators. They normalize to the repository locator plus `gitRef = "v4.x"` and
  `baseDirectory = "/bun"` when provider lookup proves that split.
- Local folder drafts produce a local path locator plus optional source-root-relative
  `baseDirectory`.
- Docker image drafts produce image identity fields such as `imageName`, `imageTag`, or
  `imageDigest`, and use a prebuilt-image runtime strategy.
- Dockerfile, Docker Compose, static, and workspace-command choices produce runtime profile fields
  such as `dockerfilePath`, `dockerComposeFilePath`, `publishDirectory`, optional `runtimeName`, or
  command defaults. Those fields are combined with the source binding's `baseDirectory` during plan
  resolution.

Framework/runtime detection is a separate planning capability over the normalized source. Entry
workflows may inspect source files to suggest a mainstream web framework profile, but the durable
command boundary remains resource profile plus ids-only deployment admission. Detected package or
project names may seed resource display names; detected frameworks, package managers, build tools,
base-image policy, start/build command defaults, and static output conventions feed
`SourceInspectionSnapshot` and the workload planner registry governed by
[Workload Framework Detection And Planning](./workload-framework-detection-and-planning.md).
They must not create `deployments.create` fields.

The first-deploy target support catalog includes JavaScript/TypeScript frameworks on Node or Bun,
static site generators, Python, Ruby, PHP, Go, Java/JVM, .NET, Elixir, Rust, Dockerfile, Docker
Compose, and prebuilt image flows. A catalog entry is considered supported only when detection,
base image policy, typed commands, artifact output, network/health behavior, and tests are specified
for that entry.

For static site first deploy, the workflow must create or select a `static-site` resource with a
source binding, `RuntimePlanStrategy = "static"`, and `runtimeProfile.publishDirectory`. Optional
install/build commands belong to the same runtime profile. The default network profile is
`internalPort = 80`, `upstreamProtocol = "http"`, and `exposureMode = "reverse-proxy"` unless an
accepted resource network configuration supplies another endpoint. The deployment step packages the
publish directory into a Docker/OCI static-server artifact; it must not run static files as a raw
host-process runtime.

If the operator supplies a runtime name during first deploy, it is persisted on the resource
profile before `deployments.create`. Deployment planning then derives an effective runtime
container/project name from that reusable value plus deployment/resource context when required for
uniqueness.

The workflow must distinguish the resource internal listener port from host exposure. A collected application "port" is `ResourceNetworkProfile.internalPort`. It is not `deployments.create.port`, and it is not a server host-published port unless an explicit `direct-port` exposure mode is accepted.

When generated default access policy is enabled, the first deployment may produce a provider-neutral generated access URL. The workflow displays it through `ResourceAccessSummary` after route snapshot/read-model state exists; it does not collect generated-domain provider settings during resource creation.

## Entry Differences

| Entrypoint | Contract |
| --- | --- |
| Web project create-resource page | Collects project, environment, source/runtime/network draft fields, server, and optional destination, then sequences `resources.create -> deployments.create(resourceId)`. |
| Web project page | Must treat resource list and create-resource as primary. New deployment from a project page must enter Quick Deploy or another entry workflow that selects or creates a resource before deployment admission. |
| Web resource detail page | Owns resource-scoped new deployment, deployment history, source/runtime configuration, and domain/TLS affordances. Redeploy is absent until reintroduced under ADR-016. |
| Web QuickDeploy | May collect a resource draft and call `resources.create` before `deployments.create`. |
| CLI resource command | Must dispatch `resources.create` for explicit resource creation. |
| CLI interactive deploy | May call `resources.create` before `deployments.create` when the user chooses a new resource. |
| HTTP API | Must use `POST /api/resources` for explicit resource creation and `POST /api/deployments` for deployment. |
| Automation/MCP | Must sequence explicit operations unless a future durable workflow command is accepted by ADR. |

## State And Event Points

| Stage | Owner | Event/state |
| --- | --- | --- |
| Resource accepted | `resources.create` | Resource aggregate persisted; `resource-created` recorded. |
| Resource observable | resource read model | Resource appears in `resources.list` or future `resources.show`. |
| Deployment accepted | `deployments.create` | Deployment state exists; `deployment-requested` recorded. |
| Deployment progresses | deployment process manager/runtime | Deployment async lifecycle events and status. |

## Failure Semantics

`resources.create` failure means no resource should be created.

If `resources.create` succeeds and `deployments.create` later fails admission, the resource remains created. The caller may retry deployment with the returned `resourceId`.

If `deployments.create` succeeds and runtime execution later fails, the resource remains created and the deployment records terminal failed state.

Quick Deploy must surface which step failed rather than presenting the whole flow as one atomic operation.

## Compatibility Path

`deployments.create.resource` is a migration compatibility path for legacy/default deployment bootstrap.

After `resources.create` is implemented, Web QuickDeploy and CLI interactive deploy must prefer:

```text
resources.create
  -> deployments.create(resourceId)
```

Compatibility use of `deployments.create.resource` must remain documented in migration notes until callers are migrated.

## Current Implementation Notes And Migration Gaps

Current deployment bootstrap can create resources during `deployments.create` admission.

Current Web QuickDeploy and CLI interactive deploy create/select a resource explicitly when project and environment context is available, then pass `resourceId` to `deployments.create`.

Deployment bootstrap remains available only where it is explicitly treated as first-class bootstrap behavior, not as a compatibility alias for resource creation.

Deployment source/runtime/network values now belong to `resources.create` input in new first-deploy flows. Any remaining deployment bootstrap paths must be reviewed and either removed or documented as explicit bootstrap behavior.

Current CLI entry code still exposes `--method` as a user-facing compatibility option. It maps to resource `RuntimePlanStrategy` before `resources.create`; it must not reach `deployments.create`.

Current Web/CLI entry code may expose generic port wording, but it must dispatch `networkProfile.internalPort` as governed by [ADR-015](../decisions/ADR-015-resource-network-profile.md).

Current `resources.create` normalizes common GitHub tree URLs into repository locator, `gitRef`,
`baseDirectory`, and `originalLocator`. Deployment admission rejects legacy resources that still
carry raw GitHub tree locators so runtime adapters do not clone browser URLs.

Repository config file support is first-deploy profile input and the headless/non-interactive
expression of Quick Deploy draft normalization. Current config schema and CLI `init` output are
profile-only, reject identity/secret/unsupported fields before mutation, and map source/runtime,
network, health, non-secret env, and supported `ci-env:` secret references through the config
bootstrap workflow before ids-only deployment admission. ADR-024 changes the target for
SSH-targeted CLI/Action runs: config `access.domains[]` should become server-applied proxy route
state on the SSH target by default, while hosted/control-plane mode can map the same intent into
managed routing/domain/TLS commands. See
[Repository Deployment Config File Bootstrap](./deployment-config-file-bootstrap.md).

Provider-backed disambiguation for slash-containing Git refs and typed runtime-profile fields for
Dockerfile/Compose paths remain future work. Static publish directory is typed for the static
strategy path.

First-class static site deployment is partially implemented: `resources.create` can persist a
static-site source/runtime/network profile, `deployments.create` remains ids-only and resolves a
static artifact intent, and the shared Quick Deploy workflow rows are covered by executable tests.
Local/generic-SSH runtime backends now generate adapter-owned static-server Dockerfiles for image
builds. Web QuickDeploy and CLI deploy now collect static draft fields and dispatch them through
`resources.create`. Local Docker static smoke coverage now verifies generated nginx packaging and
runtime health, and generic-SSH Docker static smoke coverage exists as an opt-in harness.

Generated default access route display and route snapshot persistence are governed by
[ADR-017](../decisions/ADR-017-default-access-domain-and-proxy-routing.md) and now surface through
the first-class `ResourceAccessSummary` read-model projection. Remaining first-deploy gaps are
policy editing, route precedence hardening, and broader API/Web/CLI e2e coverage.

Current Web project detail still needs a fuller ADR-013 alignment pass: resource list should become
the primary page body, project-level deployment actions should become secondary rollups or Quick
Deploy entrypoints, and resource detail should own deployment history/actions.

## Open Questions

- Resource source/runtime/network operation names are resolved as accepted candidates:
  `resources.configure-source`, `resources.configure-runtime`, and `resources.configure-network`.
  Access profile configuration remains a separate future behavior governed by ADR-017 and the
  routing/domain/TLS specs.
