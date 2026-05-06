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

`Resource -> Workload -> Config / Storage Attachment / Resource Binding -> Release -> Deployment`

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
- storage volumes and resource storage attachments are explicit domain concepts; provider-native
  Docker/Compose/Swarm volume realization belongs behind runtime adapters and future deployment
  snapshot materialization
- core does not depend on Elysia, tsyringe, Kysely, PostgreSQL drivers, or UI frameworks
- repositories exist only for aggregate roots
- entities and value objects are persisted through the owning aggregate root, never through standalone repositories
- aggregate root state and entity state use branded value objects instead of raw strings, numbers, or status literals
- Appaloft uses `unique symbol` branded classes for IDs, temporal values, statuses, names, slugs, addresses, and other domain-significant values
- state transitions live inside state-machine value objects such as `DeploymentStatusValue`, not in aggregate-level string-switch logic
- aggregate root mutations are domain operations, not generic updates; public commands must use
  intention-revealing names governed by
  [ADR-026: Aggregate Mutation Command Boundary](./decisions/ADR-026-aggregate-mutation-command-boundary.md)
- domain behavior must live on the object that owns the rule. Value-object-only rules belong on the
  value object; rules that coordinate multiple value objects owned by one entity belong on the
  entity; rules that coordinate owned entities/value objects inside one consistency boundary belong
  on the aggregate root. Domain services may coordinate across aggregate roots, but must not peel
  one object's state and reimplement that object's own policy.
- `toState()` is a serialization boundary tool. It is allowed for persistence, read-model mapping,
  adapter/runtime rendering, DTO/schema translation, fixtures, and assertions. Domain behavior,
  application services, domain services, providers, and helpers should ask intention-revealing
  methods such as `requiresInternalPort()`, `canAcceptNewWork(...)`, `canUseGeneratedAccessRoutes()`,
  or `canMarkReadyFrom...(...)` instead of branching on `.toState().x.value` or `.value === ...`
  when the answer belongs to the domain object.

## Aggregate Mutation Command Boundary

Every aggregate root mutation is part of the domain model.

Public write operations must name the domain intent, invariant, lifecycle transition, or owned
sub-profile being changed. Generic update operations such as `projects.update`, `servers.update`,
`resources.update`, `domain-bindings.update`, or `UpdateResourceCommand` are forbidden.

Allowed mutation names are specific to the aggregate language, for example:

- `projects.rename` instead of `projects.update`;
- `environments.rename`, `environments.set-variable`, and `environments.unset-variable` instead of
  `environments.update`;
- `servers.configure-credential` and `servers.bootstrap-proxy` instead of `servers.update`;
- `resources.configure-source`, `resources.configure-runtime`, `resources.configure-network`,
  `resources.configure-health`, and `resources.archive` instead of `resources.update`;
- `domain-bindings.confirm-ownership`, `domain-bindings.configure-route`,
  `domain-bindings.delete`, and `domain-bindings.retry-verification` instead of
  `domain-bindings.update`;
- `certificates.issue-or-renew`, `certificates.retry`, `certificates.revoke`, and
  `certificates.delete` instead of `certificates.update`;
- `certificates.show` instead of a transport-specific certificate detail read.
- `storage-volumes.rename` instead of `storage-volumes.update`;
- `resources.attach-storage` and `resources.detach-storage` instead of editing an untyped mount
  array.

If a future behavior appears to require one broad update command, the model is not specific enough.
The behavior must be split into separate domain commands or first receive an ADR/spec that defines a
cohesive aggregate-owned concept and its invariants.

Repository methods, persistence adapters, read-model projectors, and migrations may use storage
terms such as update/upsert internally. Those technical verbs must not leak into business operation
keys, command names, domain events, Web/API/CLI entrypoints, future MCP tools, or aggregate method
names.

## Domain Behavior Placement

No-behavior-change refactors that harden the model are governed by
[Domain Model Behavior Hardening](./specs/022-domain-model-behavior-hardening/spec.md).

When existing code needs to answer a business question, start from the ubiquitous language and the
owning object rather than from a search for primitive state reads. For example:

- a `Resource` should answer whether it needs an internal listener port, whether its source binding
  can be enriched from source inspection, and how its profile contributes to deployment admission;
- a `DeploymentTarget` should answer whether its edge proxy can participate in generated or
  server-applied route planning and whether it can be selected for proxy bootstrap/repair;
- a `DomainBinding` should answer whether ownership, route, and certificate readiness transitions
  apply, including certificate issue/import admission and whether a domain-bound, certificate, or
  route realization event may make the binding ready. It should also answer whether it can serve
  as the target of a managed canonical redirect alias;
- `EnvironmentConfigSet` and its entries should answer identity, scope matching, precedence,
  effective snapshot, and snapshot diff questions;
- a `Deployment` should answer execution-continuation and supersede-related status questions;
- `Workload` and `RuntimeSpec` should answer workload/runtime compatibility questions.
  `RuntimeSpec` owns single-runtime requirements such as whether a web-server runtime needs a
  port; `Workload` owns compatibility across its workload kind and owned runtime spec.
- `Environment`, `Resource`, and `Destination` should answer deployment context ownership
  questions such as whether an environment belongs to a project, whether a resource belongs to the
  selected project/environment, and whether a destination belongs to a selected server.

Remaining `toState()` usage must be classified as a boundary read or migrated behind
intention-revealing methods during the relevant slice.

Current boundary audit state:

- allowed boundary reads remain in persistence repositories, repository mutation specs, read-model
  and query DTO mapping, runtime adapters, transport/contract rendering, fixtures, and assertions;
- low-risk `Deployment`/`RuntimePlan` state reads found during the audit were moved behind
  intention methods;
- remaining model-hardening hotspots are future slices, not part of a mechanical rewrite:
  context ownership checks in deployment/source-link orchestration have been moved behind aggregate
  behavior; domain-binding redirect target checks have been moved behind aggregate behavior;
  certificate attempt selection has been moved behind certificate aggregate behavior;
  identity-governance membership/seat calculations have been moved behind organization aggregate
  behavior. No hotspot from the original model-hardening boundary audit remains open in this
  artifact.

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
  the selected Appaloft state backend rather than as managed `DomainBinding` lifecycle records
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
- server-applied route desired/applied state is application state in the selected Appaloft state
  backend. File-backed SSH remote-state mirrors may move this state across a CLI process boundary,
  but PostgreSQL/PGlite backends must persist it through a dedicated persistence adapter rather
  than a `Resource` repository, `DomainBinding`, `Certificate`, or deployment aggregate field.
- source fingerprint links map a normalized source identity to trusted project/environment/resource
  and optional target placement. They are not resource profile fields and must be changed only
  through explicit relink behavior, not by editing `appaloft.yml`.
- source fingerprint links are application state in the selected Appaloft state backend. File-backed
  SSH remote-state mirrors may move this state across a CLI process boundary, but
  PostgreSQL/PGlite backends must persist it through a dedicated persistence adapter rather than a
  `Resource` repository or resource aggregate field.

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
- runtime plan value objects own their own admission predicates: access routes ask edge proxy kind
  whether domains are allowed/required, and artifact snapshots ask artifact kind/intent whether an
  image reference or Compose file is required.
- `ResourceNetworkProfile` owns the resource's internal workload endpoint: `internalPort`,
  upstream protocol, exposure mode, and target service selection
- network exposure mode and health-check type value objects expose direct-port and HTTP predicates;
  `Resource` composes those predicates for network and health admission
- the generic user-facing label `port` must map to the domain field
  `ResourceNetworkProfile.internalPort` before dispatching a command
- resource detail is the owner-scoped console surface for new deployment, deployment history,
  source/runtime/network profile, generated access routes, proxy configuration, application runtime
  logs, diagnostic summary, domain/TLS, and resource-specific configuration actions
- resource-scoped configuration includes one-entry set/unset and `.env` import operations. `.env`
  import is application command parsing over the same `Resource` override layer, not a separate
  aggregate, secret backend, repository config identity source, or deployment command field.
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
- effective resource configuration is a resource-scoped read/query view over `Environment` and
  `Resource` configuration entries. It may expose masked values and safe override metadata such as
  winning scope and overridden scopes, but it must not expose plaintext secrets, mutate aggregates,
  or become a deployment-owned configuration model.
- access/proxy/log/health failure visibility belongs to application read/query surfaces. Source
  failures may preserve stable source, code, category, phase, retryability, and safe related ids, but
  copyable diagnostic and health payloads must normalize unsafe adjacent message text such as auth
  headers, cookies, sensitive query values, private keys, SSH credentials, provider raw payload
  hints, and remote raw output before returning it.
- edge request access failure diagnostics are adapter/read-model observations over public access
  failures. They map concrete proxy/upstream failures into stable `ResourceAccessFailureDiagnostic`
  codes, safe affected request descriptors, optional owner hints, related ids, request/correlation
  ids, and stable next actions. A latest safe envelope may be composed through
  `ResourceAccessSummary`, `ResourceHealthSummary`, and `ResourceDiagnosticSummary`, but it is not
  `Resource` aggregate state and is not a `domain`-category error unless it references a true
  aggregate invariant failure from another operation.
- access failure evidence lookup is short-retention resource access observation state keyed by
  request id. It stores and returns only safe `resource-access-failure/v1` envelope fields plus
  capture/expiry metadata for `resources.access-failure-evidence.lookup`; it is not aggregate state,
  not provider-native log storage, and not a route repair lifecycle.
- automatic route context lookup is internal resource access observation over existing read models.
  It resolves safe context for hostname/path access failures from generated access, durable domain
  binding, server-applied route, and deployment route read state; it is not aggregate state, not
  provider-native metadata storage, and not a mutation or route repair lifecycle.
- applied route context metadata is provider-neutral, copy-safe route ownership metadata attached
  to provider-rendered proxy preview and reusable diagnostic/evidence flows. It identifies the
  resource, deployment, optional domain binding, server, destination, route id, diagnostic id,
  source, hostname, path prefix, proxy kind, provider key, and available applied/observed timestamp
  without exposing provider raw payloads, secrets, SSH credentials, auth headers, cookies, sensitive
  query strings, or remote raw logs. It is read-model/adapter metadata, not `Resource`,
  `Deployment`, `DomainBinding`, or `DeploymentTarget` aggregate state.
- applied route context lookup is the internal read-only resolver for safe
  `applied-route-context/v1` metadata. It may resolve by diagnostic id, route id, resource id,
  deployment id, host, or path from existing resource/deployment/domain/route read state and
  supplied safe metadata. It is not a provider-native metadata store, route repair lifecycle,
  redeploy/rollback workflow, managed domain lifecycle, or aggregate mutation.
- companion/static access failure rendering is provider-neutral read/adapter output over an already
  sanitized `resource-access-failure/v1` envelope. Static runtime packaging may carry a renderer
  asset for one-shot CLI or SSH deployments without a reachable Appaloft backend service, but it
  does not create aggregate state, route repair state, provider-native metadata storage, or a new
  public operation.

### Dependency Resources

Owns:
- `ResourceInstance`
- `ResourceBinding`

Implemented now:
- foundational `ResourceInstance`
- foundational `ResourceBinding`
- Postgres Resource binding baseline: bind/unbind/list/show safe metadata
- Resource binding secret rotation safe reference/version metadata

### Postgres Dependency Resource

Meaning:
- a project/environment-owned Postgres dependency resource record represented by `ResourceInstance`

Rules:
- source mode is either `appaloft-managed` or `imported-external`
- Appaloft-managed Postgres includes durable provider-native realization state and safe provider
  handles without moving provider SDK concerns into core
- imported external Postgres delete removes only the Appaloft control-plane record and must not
  imply external database deletion
- connection read models expose only masked endpoint/connection metadata and secret references; raw
  passwords, tokens, auth headers, cookies, SSH credentials, provider tokens, private keys, and
  sensitive query parameters must not appear in list/show, events, errors, logs, or snapshots
- deletion is blocked by active/future ResourceBinding blockers, backup relationship metadata,
  provider-managed unsafe state, and future deployment snapshot/reference blockers
- binding readiness is a read-model summary; `resources.bind-dependency` must revalidate
  write-side Resource and Dependency Resource state

Current scope:
- Phase 7 baseline under
  [Postgres Dependency Resource Lifecycle](./specs/033-postgres-dependency-resource-lifecycle/spec.md)
- Phase 7 binding baseline under
  [Dependency Resource Binding Baseline](./specs/034-dependency-resource-binding-baseline/spec.md)
- Phase 7 deployment snapshot safe reference baseline under
  [Dependency Binding Deployment Snapshot Reference Baseline](./specs/035-dependency-binding-snapshot-reference-baseline/spec.md)
- Phase 7 binding secret rotation baseline under
  [Dependency Binding Secret Rotation](./specs/036-dependency-binding-secret-rotation/spec.md)
- Phase 7 Redis dependency resource lifecycle baseline under
  [Redis Dependency Resource Lifecycle](./specs/037-redis-dependency-resource-lifecycle/spec.md)
- Phase 7 provider-native Postgres realization baseline under
  [Postgres Provider-Native Realization](./specs/038-postgres-provider-native-realization/spec.md)
- Phase 7 dependency resource backup/restore planned baseline under
  [Dependency Resource Backup And Restore](./specs/039-dependency-resource-backup-restore/spec.md)
- provider-native credential rotation, runtime env injection, and provider-native runtime
  materialization are future Phase 7 work

### Dependency Resource Backup

Meaning:
- a dependency-resource-owned backup attempt and restore point represented by
  `DependencyResourceBackup`

Rules:
- one backup belongs to one `ResourceInstance`
- ready backups expose only safe restore point metadata and provider artifact handles
- restore is in-place to the same dependency resource in the first Phase 7 slice
- restore requires explicit overwrite and runtime-not-restarted acknowledgements
- retained ready backups and in-flight backup/restore attempts block dependency resource deletion
- backup/restore must not mutate ResourceBindings, historical deployment snapshots, runtime env, or
  workload runtime state
- raw dump contents, passwords, provider credentials, raw connection URLs, provider SDK payloads,
  and command output must not appear in core state, read models, events, errors, logs, or public
  contracts

Current scope:
- governed by
  [ADR-036: Dependency Resource Backup And Restore Lifecycle](./decisions/ADR-036-dependency-resource-backup-restore-lifecycle.md)
  and [Dependency Resource Backup And Restore](./specs/039-dependency-resource-backup-restore/spec.md)

### Release Orchestration

Owns:
- `Release`
- `Deployment`
- `PreviewEnvironment`
- rollback plans and execution results

Implemented now:
- `Release`
- `Deployment`
- foundational `PreviewEnvironment`
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
- deployment snapshots may record provider-neutral safe dependency binding references copied from
  active Resource bindings at admission time; these references are immutable attempt context and do
  not imply runtime environment injection
- deployment success is not current resource health. Attempt-time verification can feed resource
  health observation, but the long-lived current health view belongs to Workload Delivery read
  models such as `ResourceHealthSummary`.
- deployments are displayed under the Resource that owns them; global or project-level deployment
  pages are read/query rollups
- deployment logs are attempt/progress records; application runtime logs are resource-owned
  observation and must not be treated as Deployment aggregate state unless a future ADR introduces
  persisted runtime log archival
- public rollback is active under ADR-016/ADR-034, and rollback plans in the v1 model reference
  prior deployment snapshots and Docker/OCI runtime artifact identity rather than reconstructing
  host-process command state
- `PreviewPolicy` is currently an application/persistence control-plane record, not a core
  aggregate. It stores project- or Resource-scoped preview policy settings for same-repository
  previews, fork preview mode, secret-backed preview eligibility, active preview quota, and preview
  TTL; durable read models expose safe configured/default summaries without idempotency keys,
  provider payloads, or secret material.
- `PreviewEnvironment` is the product-grade preview lifecycle identity for one preview scope, such
  as a GitHub pull request. It records project/environment/resource/target placement, safe source
  fingerprint context, provider-neutral status, expiry, and cleanup-request state. It does not own
  source binding, production config, deployment admission input, provider comments/checks, or
  runtime cleanup execution.
- Phase 7 Postgres/PGlite persistence for `PreviewEnvironment` stores safe list/show/delete
  lifecycle state by scoped preview environment and Resource identity. Deployment dispatch,
  feedback, and cleanup retry remain process/application work rather than aggregate state.

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
- environments answer whether they belong to a selected project context
- `domain-bindings.create` and other cross-context commands must use the aggregate-owned
  project membership question instead of re-reading environment state ids for policy decisions
- snapshots are immutable
- build-time variables must be explicitly public
- lifecycle state is explicit; locked environments remain readable but reject new configuration
  writes, promotion, resource creation, and deployment admission until unlocked; archived
  environments remain readable and retired

Current scope:
- variables and snapshot logic are inside the aggregate
- `EnvironmentConfigSet` is modeled as a value object used by `Environment`
- configuration entries own key/exposure identity, scope matching, precedence comparison, and
  snapshot equality; callers should not rebuild those comparisons from primitive entry state
- `EnvironmentLifecycleStatus`, `LockedAt`, optional `LockReason`, `ArchivedAt`, and optional
  `ArchiveReason` are part of the aggregate state

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
- owns generated-route proxy selection and proxy bootstrap provider selection; application services
  should call target behavior instead of branching on edge proxy kind/status primitives
- changes to current edge proxy intent are deployment-target lifecycle mutations through
  `servers.configure-edge-proxy`; they must not change server identity, host, provider,
  credential, lifecycle state, historical deployment/domain/route/audit references, or
  provider-owned runtime artifacts
- may host the default `ssh-pglite` Appaloft state backend for CLI/GitHub Actions deployments,
  while PostgreSQL/PGlite selected backends persist source link state and server-applied proxy route
  desired/applied state through dedicated application persistence adapters
- current code uses the canonical target-kind values `single-server` and `orchestrator-cluster`;
  cluster runtime providers such as Docker Swarm still require backend readiness and execution
  support before they are deployable

### Destination

Meaning:
- deployment placement and isolation boundary on a `DeploymentTarget`
- the target-side landing zone a resource deploys to

Rules:
- belongs to exactly one deployment target/server
- destinations answer whether they belong to a selected deployment target/server context
- `domain-bindings.create` must use the destination-owned server membership question when
  validating binding placement
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
- binding creation uses `Environment`, `Resource`, and `Destination` ownership behavior for
  context admission before creating the durable binding
- a binding may be a managed canonical redirect alias when `redirectTo` references an existing
  served binding in the same owner/path scope; redirect aliases still own their source hostname
- bindings answer whether they can serve as a managed canonical redirect target; redirect aliases
  cannot serve as redirect targets for other bindings
- binding route admission uses edge-proxy kind predicates and value-object equality for redirect
  target/self-target/change detection
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
- owns certificate issue/import admission and certificate-required readiness gates
- owns whether domain-bound, certificate-issued/imported, and route realization events may mark the
  binding ready; application handlers coordinate repositories/events and call aggregate behavior
- binding status value owns lifecycle gates for ready marking, route-failure recording, and
  verification retry eligibility
- owns ownership-confirmation attempt selection, idempotent already-bound confirmation, and the DNS
  verification context prepared from its current verification attempts and DNS observation
- `Certificate` owns certificate attempt worker selection, including missing/terminal attempt
  handling and the provider issue context prepared from the selected attempt
- `Certificate` owns retry admission, revocation eligibility, Appaloft-local imported certificate
  revocation, and guarded delete eligibility. Provider revocation and secret-store deactivation are
  application/provider boundary work coordinated after the aggregate admits the transition.
- DNS verification, certificate issuance/import, route failure, and domain-ready transitions are
  implemented through explicit command/event workflows while the binding remains the owner of its
  own lifecycle predicates

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
- static-site workloads must declare static-site runtimes, worker workloads must not declare
  web-server runtimes, and web-server runtimes must declare their listener port

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
- compose-stack resources may contain multiple named services; `ResourceKindValue` answers whether
  multiple services are allowed and `Resource` owns the admission error
- a resource may point at a default destination
- resources answer whether they belong to a selected project/environment context and whether a
  selected destination is compatible with their default destination placement
- deployments belong to a resource, not directly to a raw source locator
- inbound application resources must have a resource-owned network endpoint before deployment
  admission can resolve reverse-proxy upstream targets
- resource kind and service kind value objects own whether inbound traffic requires an internal
  listener port
- `internalPort` means the workload listener inside the runtime environment or container network;
  it is not the server host-published port
- reverse-proxy resources may share the same `internalPort` on one deployment target because the
  runtime/proxy fabric isolates them by resource/deployment identity
- direct host publication is explicit and must not be the default exposure model for HTTP
  application resources; host-port conflicts are direct-port placement failures, not permission to
  stop another resource
- generated default access routes target `ResourceNetworkProfile.internalPort` through the selected
  deployment target's edge proxy and do not require public host publication of the application port
- runtime stop/start/restart are Resource-scoped operational controls over current or retained
  runtime placement. They do not mutate Resource profile, create Deployment attempts, apply profile
  changes, or rewrite deployment snapshots. Runtime control attempt state is governed by
  [ADR-038: Resource Runtime Control Ownership](./decisions/ADR-038-resource-runtime-control-ownership.md)
  and remains separate from Resource lifecycle status.
- resource storage attachments belong to the Resource profile. Attach/detach affects future
  deployment snapshots only and does not apply mounts to current runtime state or rewrite historical
  deployment snapshots
- one Resource may not attach two storage volumes at the same normalized destination path

Current scope:
- foundational aggregate in `core`
- persisted and listed through application read models
- deployment creation can resolve, bootstrap, and attach a resource and destination
- current code stores the listener port as `ResourceNetworkProfile.internalPort`, governed by [ADR-015: Resource Network Profile](./decisions/ADR-015-resource-network-profile.md)

### StorageVolume

Meaning:
- project/environment-scoped durable storage identity
- can represent a provider-neutral named volume or a trusted bind mount source path
- can be attached to one or more Resources through resource-owned attachment records

Rules:
- names are unique within a project environment
- `named-volume` stores provider-neutral identity only; runtime adapters may later map it to
  Docker/Compose/Swarm provider-native storage
- `bind-mount` stores a trusted source path as adapter/runtime boundary data after strict path
  validation
- deletion is blocked while any active Resource attachment references the volume
- backup relationship metadata is metadata-only in this slice, but it participates in delete safety
- storage commands do not create deployments, provision provider-native volumes, run backup/restore,
  prune runtime state, or mutate historical deployment snapshots

Current scope:
- Phase 7 baseline aggregate planned under
  [Storage Volume Lifecycle And Resource Attachment](./specs/032-storage-volume-lifecycle-and-resource-attachment/spec.md)
- intended to feed provider-neutral storage mount metadata into future deployment snapshots

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
- active Resource dependency bindings are copied into safe dependency binding snapshot references;
  they are not command input and do not contain secret or materialized environment values

Current scope:
- state machine for plan -> run -> verify -> rollback
- belongs to exactly one `Resource`
- carries both `destinationId` and `serverId`; `serverId` remains in persisted shape for transport
  compatibility and efficient target lookup
- owns execution-continuation and supersede runtime-cancellation questions; application guards and
  deployment use cases should ask `Deployment` instead of branching on raw deployment status values

### ResourceBinding

Meaning:
- explicit dependency contract between Resource and ResourceInstance

Rules:
- binding is an independent write-side association/aggregate, not internal `ResourceInstance`
  state and not merely a read-side join
- binding admission loads Resource and Dependency Resource and accepts only matching
  project/environment ownership in this slice
- binding stores only provider-neutral safe metadata: Resource reference, Dependency Resource
  reference, target name/profile label, scope, injection mode, safe secret reference pointer,
  safe secret version/rotation metadata, lifecycle status, and timestamps
- binding must not store raw connection strings, raw passwords, tokens, auth headers, cookies, SSH
  credentials, provider tokens, private keys, sensitive query parameters, or raw environment values
- binding scope and injection mode must remain coherent
- build-only bindings must not leak runtime references
- scope and injection mode value objects answer single-value predicates, while `ResourceBinding`
  owns the cross-VO coherence rule
- unbind removes/tombstones only the association; it must not delete the dependency resource,
  external/provider database, runtime state, backup data, or historical deployment snapshot
- binding secret rotation replaces only the binding-scoped safe secret reference/version for future
  deployments; it must not rotate provider-native credentials, inject runtime env, restart runtime,
  or rewrite historical deployment snapshots

Current scope:
- wired into Phase 7 Postgres Dependency Resource Binding Baseline through
  `resources.bind-dependency`, `resources.unbind-dependency`,
  `resources.list-dependency-bindings`, and `resources.show-dependency-binding`
- new deployment attempts copy active binding metadata into safe dependency binding snapshot
  references
- `resources.rotate-dependency-binding-secret` updates the safe binding secret reference/version
  used by future deployments
- runtime env injection remains deferred

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
- membership identity is owned by `OrganizationMember`; seat capacity is owned by
  `OrganizationPlan`; `Organization` coordinates those rules across its owned members and plan

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
