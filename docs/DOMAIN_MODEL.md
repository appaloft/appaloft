# Domain Model

> CORE DOCUMENT
>
> This file is the domain-model source of truth for Appaloft.
> If a package layout, aggregate name, or application slice conflicts with this file, this file wins.
> [CORE_OPERATIONS.md](/Users/nichenqin/projects/appaloft/docs/CORE_OPERATIONS.md) defines the business surface.
> [BUSINESS_OPERATION_MAP.md](/Users/nichenqin/projects/appaloft/docs/BUSINESS_OPERATION_MAP.md)
> defines how commands, queries, workflows, events, and rebuild gates relate to each other.
> This file defines the domain boundaries and ubiquitous language underneath that surface.

## Design Goal

Appaloft is not primarily "server CRUD". Its core project-facing flow is:

`Project -> Environment -> Resource -> Deployment`

Resources are the deployable units users organize inside environments. Workloads, config,
dependency bindings, releases, and runtime targets sit underneath that flow:

`Resource -> Workload -> Config / Resource Binding -> Release -> Deployment`

Runtime placement is a separate relationship:

`Resource -> Destination -> DeploymentTarget(Server)`

A deployment platform only becomes coherent when those boundaries are explicit.

Console and navigation ownership follows the same model. `Project` is the resource collection
boundary; `Resource` owns new deployment actions and deployment history; `Deployment` is the attempt
record. Public redeploy behavior is rebuild-required under ADR-016 until reintroduced by specs.
Project-level deployment lists are read-model rollups across resources, not project-owned
deployment write operations. See
[ADR-013: Project Resource Navigation And Deployment Ownership](./decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md).

Quick Deploy is not a domain aggregate in this model. It is an entry workflow that guides source,
project, deployment target/server, environment, resource, and deployment input collection before
dispatching explicit operations. The final deployment write remains `deployments.create`; see
[ADR-010: Quick Deploy Workflow Boundary](./decisions/ADR-010-quick-deploy-workflow-boundary.md).

## Core Principles

- aggregate boundaries follow invariants, not UI screens
- cross-aggregate references use IDs, not deep object graphs
- release and deployment are different concepts
- environment is a first-class domain object
- resource binding must remain an explicit domain concept
- core does not depend on Elysia, tsyringe, Kysely, PostgreSQL drivers, or UI frameworks
- repositories exist only for aggregate roots
- entities and value objects are persisted through the owning aggregate root, never through standalone repositories
- aggregate root state and entity state use branded value objects instead of raw strings, numbers, or status literals
- Appaloft uses `unique symbol` branded classes for IDs, temporal values, statuses, names, slugs, addresses, and other domain-significant values
- state transitions live inside state-machine value objects such as `DeploymentStatusValue`, not in aggregate-level string-switch logic

## Bounded Contexts

Current Appaloft is organized around these contexts:

### Workspace

Owns:
- `Project`
- `Environment`

Implemented now:
- `Project`
- `Environment`

Boundary rule:
- Project is the top-level workspace and resource collection boundary
- Project must not own deployment attempt actions directly
- Project-level deployment lists are rollup read models over Resource-owned deployments

### Configuration

Owns:
- `EnvironmentConfigSet`
- environment snapshots
- precedence and build/runtime separation

Implemented now:
- `EnvironmentConfigSet` as a domain value object used inside `Environment`
- immutable `EnvironmentSnapshot`

### Runtime Topology

Owns:
- `DeploymentTarget`
- `Destination`
- `DomainBinding`
- edge proxy intent and readiness state
- provider-neutral generated access domain policy and resolved route snapshots
- target capability and provider-facing endpoint metadata
- deployment placement / isolation boundaries on a target
- runtime orchestration target shape and provider capability selection
- SSH-server Appaloft state placement for pure CLI/GitHub Actions deployments

Implemented now:
- `DeploymentTarget`
- optional deployment target credential state for local SSH agent or SSH private key access
- server-level edge proxy intent and bootstrap status for disabled or provider-backed edge proxy
  modes
- `Destination`
- runtime-plan access routes with proxy route intent and provider-facing route metadata
- durable `DomainBinding` state for resource-scoped public domain ownership and pending
  verification
- server-applied proxy route desired/applied state for pure CLI/SSH config domains, persisted in
  SSH-server Appaloft state rather than as managed `DomainBinding` lifecycle records
- source fingerprint link state for pure CLI/SSH repeatability, persisted as application state in
  the selected Appaloft state backend rather than as committed repository config

Accepted target model:
- generated default access domains are resolved through a provider-neutral application port and
  concrete infrastructure adapters governed by [ADR-017](./decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- concrete generated-domain provider packages live under `packages/providers/default-access-domain-*`
- concrete generated-domain services must not appear in core/application domain types or command
  schemas
- edge proxy providers are selected behind application ports and provider registries governed by
  [ADR-019](./decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)
- concrete edge proxy provider packages live under `packages/providers/edge-proxy-*`
- proxy bootstrap, route realization, generated labels/config files, logs, and diagnostics belong
  to concrete edge proxy providers and runtime executors, not command handlers or Web/CLI code
- edge proxy is not a standalone aggregate root in v1; `DeploymentTarget` owns edge proxy intent,
  current status, and readiness summary
- pure CLI and GitHub Actions deployments to an SSH target use SSH-server PGlite as the default
  Appaloft state backend under
  [ADR-024](./decisions/ADR-024-pure-cli-ssh-state-and-server-applied-domains.md); runner-local
  PGlite is explicit local-only state, not the source of truth for SSH-targeted deployments
- control-plane mode selection under
  [ADR-025](./decisions/ADR-025-control-plane-modes-and-action-execution.md) is not an aggregate
  root and not a deployment command field. It is entry workflow state that decides whether
  Appaloft state is owned by SSH-server `ssh-pglite`, Appaloft Cloud, a self-hosted Appaloft
  control plane, or an advanced external Postgres backend before identity and deployment commands
  run.

Transport compatibility note:
- CLI / HTTP still expose `server` naming for backward compatibility
- the core domain term is `DeploymentTarget`
- `Destination` is the concrete place a resource deploys to on a target/server
- `DeploymentTarget.targetKind` describes the target shape, such as `single-server` or the future
  `orchestrator-cluster`; concrete runtime providers are selected by provider key and capabilities
  rather than provider-specific fields on deployment commands
- access routes express public-domain intent, including provider-neutral canonical redirect aliases;
  provider-specific labels, files, commands, redirect middleware, and route manifests are rendered
  by concrete edge proxy providers, not core aggregates
- execution owner and control-plane/state owner are independent. GitHub Actions, CLI, a
  local-Web-agent, or a future MCP tool may execute an entry workflow while a Cloud or self-hosted
  control plane owns source links, locks, identity, audit, and managed domain workflow state.
- repository config may express non-secret control-plane connection policy, but it must not select
  project, resource, server, destination, credential, organization, or tenant identity. Those
  identities come from trusted entrypoint inputs, authenticated control-plane state, source
  fingerprint links, adoption markers, or explicit relink/adoption operations.
- `access.domains[]` from repository config expresses provider-neutral custom domain route intent.
  In pure CLI/SSH mode it becomes target-local server-applied route state owned by the selected
  deployment target and edge proxy provider; in control-plane mode it may be mapped to managed
  `DomainBinding` lifecycle commands after trusted context exists. Redirect entries such as
  `www.example.com -> example.com` are alias route intent for the same resource context and must not
  retarget traffic across projects, resources, servers, destinations, or credentials.
- server registration emits a domain event; application event handlers may soft-fail while asking
  runtime adapters to bootstrap the configured edge proxy and persist the resulting status
- runtime adapters execute provider-produced shared edge proxy and route realization plans when a
  runtime plan carries access routes
- `DomainBinding` is separate from generated default access and deployment route snapshots; it
  starts a durable routing/domain/TLS lifecycle and publishes `domain-binding-requested`
- server-applied config domains are also separate from `DomainBinding`; they are migratable
  SSH-target state for pure CLI operation, not proof that Appaloft owns an always-on DNS or
  certificate scheduler. Canonical redirect source hosts still require DNS and provider-local TLS
  coverage when HTTPS redirects are expected.
- source fingerprint links map a normalized source identity to trusted project/environment/resource
  and optional target placement. They are not resource profile fields and must be changed only
  through explicit relink behavior, not by editing `appaloft.yml`.

### Workload Delivery

Owns:
- `Resource`
- `Workload`
- `SourceSpec`
- `BuildSpec`
- `RuntimeSpec`
- `ResourceNetworkProfile`

Implemented now:
- foundational `Resource`
- foundational `Workload`, `SourceSpec`, `BuildSpec`, `RuntimeSpec` models in `core`
- runtime planning still flows through `RuntimePlanResolver` and `RuntimePlan`

Boundary rule:
- reusable source binding, build commands, runtime commands, network endpoint defaults, and health
  policy belong to the resource-side source/runtime/network profile language
- source binding is a discriminated resource configuration model. Git repository identity, Git
  ref, source base directory, local-folder source roots, Docker image tags/digests, and artifact
  extraction roots are source-side concerns; Dockerfile path, Compose file path, static publish
  directory, build target, and command defaults are runtime profile concerns; internal listener
  ports and exposure modes are network profile concerns.
- framework and package detection is typed workload-planning evidence, not a Web/CLI shortcut and
  not durable deployment identity. `SourceInspectionSnapshot` may record runtime family,
  framework, package manager/build tool, package/project name, runtime version, lockfiles, scripts,
  and build-output clues. Framework planners use those facts plus `ResourceRuntimeProfile` to
  choose base image and typed install/build/start/package steps, but framework-specific package
  objects, provider SDK types, Docker SDK responses, and raw shell output stay outside core.
- `RuntimePlanStrategy` describes how a source is planned; the compatibility field name
  `deploymentMethod` must not be treated as a `Deployment` aggregate concept
- v1 runtime planning is Docker/OCI-backed. A runtime strategy must produce, pull, or reference an
  OCI/Docker image artifact, or materialize a Docker Compose project whose runnable services use
  OCI/Docker images. Auto/buildpack-style and workspace-command strategies are image production
  strategies, not direct long-lived host-process execution.
- Docker/OCI is the workload artifact substrate; runtime orchestration target selection is a
  separate boundary governed by
  [ADR-023](./decisions/ADR-023-runtime-orchestration-target-boundary.md). Future Docker Swarm or
  Kubernetes backends must consume the same resource source/runtime/network/access contracts instead
  of adding orchestrator-specific input fields to Resource or Deployment commands.
- runtime command composition belongs to the runtime plan language as typed command specs. Rendered
  shell strings are adapter execution artifacts for local shell, SSH shell, or another executor,
  and must not become the domain object that workflow logic branches on.
- `ResourceNetworkProfile` owns the resource's internal workload endpoint: `internalPort`,
  upstream protocol, exposure mode, and target service selection
- the generic user-facing label `port` must map to the domain field
  `ResourceNetworkProfile.internalPort` before dispatching a command
- resource detail is the owner-scoped console surface for new deployment, deployment history,
  source/runtime/network profile, generated access routes, proxy configuration, application runtime
  logs, diagnostic summary, domain/TLS, and resource-specific configuration actions
- application runtime log observation belongs to the resource surface and is performed through an
  application-layer runtime log reader port. Docker/Compose is the v1 deployment-backed reader
  substrate under ADR-021; future PM2, systemd, file-tail, and provider log mechanisms are adapter
  details that require ADR coverage before they become public workload runtime strategies, and must
  not leak into core aggregates
- current resource health observation belongs to the resource surface and is performed through
  application-layer read/query ports that inspect runtime/container/process state, configured
  health policy, proxy route state, and public access state. `ResourceHealthSummary` is a read
  model/projection, not `Resource` aggregate state.
- generated default access routes target `ResourceNetworkProfile.internalPort` through the selected
  deployment target's proxy; generated route providers are infrastructure adapters, not resource
  aggregate logic
- current generated access URL/status is exposed through a resource-scoped read-model projection
  such as `ResourceAccessSummary`; it is not persisted as `Resource` aggregate state
- durable domain bindings are resource-scoped. A deployment attempt may snapshot the route it used,
  but domain ownership and current access status belong to resource/domain read models.
- full generated proxy configuration is exposed through a resource-scoped read/query view such as
  `ProxyConfigurationView`; it is operator-facing read-model output, not `Resource` aggregate state
- support/debug diagnostics are exposed through a resource-scoped read/query view such as
  `ResourceDiagnosticSummary`; it composes read-model state and safe adapter/system context, and is
  not `Resource` aggregate state

### Dependency Resources

Owns:
- `ResourceInstance`
- `ResourceBinding`

Implemented now:
- foundational `ResourceInstance`
- foundational `ResourceBinding`

### Release Orchestration

Owns:
- `Release`
- `Deployment`
- rollback plans and execution results

Implemented now:
- `Release`
- `Deployment`
- `RuntimePlan`
- `RollbackPlan`

Boundary rule:
- `Deployment` owns an accepted attempt and the immutable `RuntimePlanSnapshot` used by that
  attempt
- v1 deployment snapshots must include enough provider-neutral runtime artifact and placement
  identity to inspect, verify, clean up, and eventually roll back Docker/OCI-backed runtime
  instances without exposing Docker-native fields as aggregate invariants
- deployment execution is routed to a runtime target backend selected from the deployment target,
  destination, provider key, and backend capabilities. Single-server Docker/Compose is the active
  v1 backend; Docker Swarm and Kubernetes are future orchestration backends behind the same
  `deployments.create` command.
- deployment runtime command steps should be represented as typed specs when they are persisted or
  handed between planning and execution. Shell command text is allowed only as a user-authored
  shell-script leaf or as an adapter-rendered execution/display value.
- `Deployment` does not own durable source binding, runtime profile, network profile, generated
  access policy, domain binding, or certificate policy
- deployment snapshots may record resolved generated or durable access routes used by that attempt
- deployment success is not current resource health. Attempt-time verification can feed resource
  health observation, but the long-lived current health view belongs to Workload Delivery read
  models such as `ResourceHealthSummary`.
- deployments are displayed under the Resource that owns them; global or project-level deployment
  pages are read/query rollups
- deployment logs are attempt/progress records; application runtime logs are resource-owned
  observation and must not be treated as Deployment aggregate state unless a future ADR introduces
  persisted runtime log archival
- public rollback remains absent under ADR-016, but rollback plans in the v1 model are expected to
  reference prior deployment snapshots and Docker/OCI runtime artifact identity rather than
  reconstructing host-process command state

### Identity & Governance

Owns:
- `Organization`
- `Member`
- `Role`
- quota and billing policy

Implemented now:
- foundational `Organization`
- foundational `OrganizationMember`
- foundational `OrganizationPlan`

### Extensibility

Owns:
- `ProviderConnection`
- `IntegrationConnection`
- `PluginInstallation`

Implemented now:
- provider, integration, plugin registries and descriptors
- foundational `ProviderConnection`
- foundational `IntegrationConnection`
- foundational `PluginInstallation`

## Implemented Domain Object Inventory

### Aggregate Roots

- `Project`
- `Environment`
- `DeploymentTarget`
- `Destination`
- `DomainBinding`
- `Resource`
- `Workload`
- `ResourceInstance`
- `ResourceBinding`
- `Release`
- `Deployment`
- `Organization`
- `ProviderConnection`
- `IntegrationConnection`
- `PluginInstallation`

### Entities

- `OrganizationMember`

### Value Objects

- `EnvironmentConfigSet`
- `OrganizationPlan`
- `SourceSpec`
- `BuildSpec`
- `RuntimeSpec`
- `ResourceNetworkProfile`
- `EnvironmentSnapshot`
- `RollbackPlan`
- `ExecutionResult`
- shared branded primitives such as IDs, timestamps, status/state-machine values, numeric values, and domain-significant text values

## Repository Rule

- `ProjectRepository` persists only the `Project` aggregate root
- `ServerRepository` persists only the `DeploymentTarget` aggregate root exposed through transport-compatible `server` naming
- `DestinationRepository` persists only the `Destination` aggregate root
- `EnvironmentRepository` persists only the `Environment` aggregate root
- `ResourceRepository` persists only the `Resource` aggregate root
- `DeploymentRepository` persists only the `Deployment` aggregate root
- `DomainBindingRepository` persists only the `DomainBinding` aggregate root and its owned
  verification attempts
- selection spec visitors own the full persistence-query translation
- persistence adapters pass a `SelectQueryBuilder` into the selection visitor and execute the returned builder
- repositories must not split selection-spec translation into separate intermediate clause objects
- read models are not repositories and may shape data for query use cases
- entity and value object types such as `OrganizationMember`, `EnvironmentConfigSet`, `SourceSpec`, and `RollbackPlan` do not get independent repositories

## Aggregate Map

### Project

Meaning:
- top-level deployment management unit

Rules:
- slug must be derivable and stable
- archived projects must not accept new mutable child records

Current scope:
- metadata and ownership
- does not yet own persisted source bindings
- may be bootstrapped from a local deployment config or inferred local source metadata, but that
  config remains an adapter/application input and is not persisted as project source binding

### Environment

Meaning:
- deployment isolation boundary

Rules:
- names are unique within a project
- snapshots are immutable
- build-time variables must be explicitly public

Current scope:
- variables and snapshot logic are inside the aggregate
- `EnvironmentConfigSet` is modeled as a value object used by `Environment`

### DeploymentTarget

Meaning:
- generalized server / runtime host target

Rules:
- one target has one provider family
- unhealthy/draining targets should not accept new deployments
- proxy-backed generated access requires target proxy readiness and a usable public address or host
- target proxy bootstrap state is a readiness gate, not a standalone proxy aggregate
- target kind describes placement shape, not vendor-specific execution details
- runtime target provider capabilities decide whether the target can execute single-server
  Docker/Compose now or future cluster orchestration such as Docker Swarm or Kubernetes
- pure CLI SSH state is target-local Appaloft metadata/state, not user workload data, and must be
  migrated or adopted explicitly when moving the same server to a hosted/self-hosted control plane

Current scope:
- single-node target metadata
- current transport compatibility name: `server`
- may be reused or created from deployment config after provider-key validation in the application
  layer; provider SDK specifics remain outside the aggregate
- owns current edge proxy intent/status summary for server readiness and proxy-backed deployment
  admission/read-model display
- may host the default `ssh-pglite` Appaloft state backend for CLI/GitHub Actions deployments,
  including source link state and server-applied proxy route desired/applied state
- current code includes provisional future target-kind values; they must be replaced with the
  canonical target model from ADR-023 before cluster targets become public or persisted by new
  features

### Destination

Meaning:
- deployment placement and isolation boundary on a `DeploymentTarget`
- the target-side landing zone a resource deploys to

Rules:
- belongs to exactly one deployment target/server
- names are unique within a target
- deployments reference the selected destination as well as the selected target

Current scope:
- persisted and bootstrapped as a default local destination
- deployment config may declare a target-local destination
- proxy/domain routing is modeled as resolved access-route snapshots on runtime plans; standalone
  persisted access-route aggregates remain separate from durable `DomainBinding`
- future cluster backends may map a destination to a namespace-like or placement-isolation concept,
  but Kubernetes namespaces, Swarm stack names, and rendered manifests remain adapter-owned unless
  a future Spec Round introduces provider-neutral placement value objects

### DomainBinding

Meaning:
- durable public domain and route ownership state for a resource placement
- connects project/environment/resource ownership to destination/server routing and TLS readiness

Rules:
- owner scope is governed by ADR-005: project, environment, resource, destination, server, domain,
  path prefix, proxy kind, TLS mode, and certificate policy are explicit
- active bindings must be unique by normalized project/environment/resource/domain/path scope
- a binding may be a managed canonical redirect alias when `redirectTo` references an existing
  served binding in the same owner/path scope; redirect aliases still own their source hostname
- durable bindings require an edge proxy kind; `none` is only valid for deployment runtime
  access-route hints
- command success means the request is accepted and pending verification, not traffic readiness
- the first manual domain verification attempt is owned by the aggregate at creation time

Current scope:
- persisted through `DomainBindingRepository`
- created by `domain-bindings.create`
- publishes `domain-binding-requested`
- records pending verification state and first manual verification attempt
- records optional canonical redirect target/status metadata for redirect-only route realization
- DNS verification, certificate issuance, and domain-ready transitions remain future workflow work

### SSH Credential

Meaning:
- reusable SSH login material for deployment targets
- lets a server reference an imported or generated key instead of forcing every server flow to
  paste private key text

Rules:
- the private key is write-side secret material and must not appear in read models
- read models may expose whether a private key or public key is configured, plus display metadata
  such as name and username
- configuring a deployment target from a credential stores a server-local execution snapshot and
  the credential reference

Current scope:
- persisted through the credential library
- listed as masked summaries
- usable when configuring a deployment target credential

### Workload

Meaning:
- the unit that is delivered and run

Rules:
- workload kind, build spec, and runtime spec must remain compatible
- static sites cannot declare worker runtimes

Current scope:
- foundational aggregate in `core`
- not yet persisted or exposed through commands

### Resource

Meaning:
- project/environment-scoped deployable unit
- can represent an app, API service, database, cache, worker, static site, external service, or
  Docker Compose stack
- created explicitly through the minimum `resources.create` lifecycle governed by
  [ADR-011: Resource Create Minimum Lifecycle](./decisions/ADR-011-resource-create-minimum-lifecycle.md)

Rules:
- names are unique within a project environment
- compose-stack resources may contain multiple named services
- a resource may point at a default destination
- deployments belong to a resource, not directly to a raw source locator
- inbound application resources must have a resource-owned network endpoint before deployment
  admission can resolve reverse-proxy upstream targets
- `internalPort` means the workload listener inside the runtime environment or container network;
  it is not the server host-published port
- reverse-proxy resources may share the same `internalPort` on one deployment target because the
  runtime/proxy fabric isolates them by resource/deployment identity
- direct host publication is explicit and must not be the default exposure model for HTTP
  application resources; host-port conflicts are direct-port placement failures, not permission to
  stop another resource
- generated default access routes target `ResourceNetworkProfile.internalPort` through the selected
  deployment target's edge proxy and do not require public host publication of the application port

Current scope:
- foundational aggregate in `core`
- persisted and listed through application read models
- deployment creation can resolve, bootstrap, and attach a resource and destination
- current code stores the listener port as `ResourceNetworkProfile.internalPort`, governed by [ADR-015: Resource Network Profile](./decisions/ADR-015-resource-network-profile.md)

### Release

Meaning:
- immutable delivery snapshot

Rules:
- once sealed, it is immutable
- it belongs to exactly one workload and one environment

Current scope:
- foundational aggregate in `core`
- deployment flows still materialize runtime plan + environment snapshot directly

### Deployment

Meaning:
- one execution attempt of a delivery plan for a resource against a destination on a deployment target

Rules:
- state transitions are ordered
- terminal state appears once
- rollback references prior successful execution
- generated and durable access routes are copied into the runtime plan snapshot for the attempt;
  they are not command input

Current scope:
- state machine for plan -> run -> verify -> rollback
- belongs to exactly one `Resource`
- carries both `destinationId` and `serverId`; `serverId` remains in persisted shape for transport
  compatibility and efficient target lookup

### ResourceBinding

Meaning:
- explicit dependency contract between workload and resource instance

Rules:
- binding scope and injection mode must remain coherent
- build-only bindings must not leak runtime references

Current scope:
- foundational aggregate in `core`
- not yet wired into application operations

### ResourceInstance

Meaning:
- provisioned dependency resource owned by system, organization, or project scope

Rules:
- a resource instance belongs to exactly one owner scope
- status transitions must remain monotonic from provisioning to ready or deleted

Current scope:
- foundational aggregate in `core`
- provider-backed provisioning orchestration is still future work

### Organization

Meaning:
- governance boundary for hosted control-plane and future tenant isolation

Rules:
- at least one owner must exist at creation time
- plan changes cannot invalidate the current member count

Current scope:
- foundational aggregate in `core`
- identity provider integration is still future work

### ProviderConnection / IntegrationConnection / PluginInstallation

Meaning:
- explicit ownership and lifecycle for external provider access, external integrations, and system/plugin installation state

Rules:
- every connection or installation belongs to one owner scope
- lifecycle state is explicit and not inferred from transport-only settings

Current scope:
- foundational aggregates in `core`
- application persistence and commands are still future work

## Current Implementation Mapping

These directories are authoritative for current domain code:

```text
packages/core/src/
  shared/
  workspace/
  configuration/
  runtime-topology/
  workload-delivery/
  dependency-resources/
  release-orchestration/
  identity-governance/
  extensibility/
```

Root-level files under `packages/core/src/*.ts` now exist only as compatibility re-exports.
New domain work should go into the bounded-context directories above.

## Application Layer Mapping

Application slices should be understood through the same contexts:

- `workspace`: projects and environments
- `workload-delivery`: project resources and workloads
- `runtime-topology`: deployment target registration/listing, destinations, edge proxy state, and
  domain binding admission
- `release-orchestration`: deployment creation, listing, logs, rollback
- `extensibility`: providers, plugins, GitHub repository browsing, system diagnostics

## Naming Rules

- prefer domain names over implementation names
- prefer `DeploymentTarget` over `Server`
- prefer `Environment` over `EnvironmentProfile`
- use `Release` for immutable delivery snapshots
- use `Deployment` for runtime execution attempts

Compatibility aliases may exist temporarily, but new code and new docs should use the domain names.
