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

Blueprint is not a domain aggregate in the current model. It is a portable, versioned, instantiable
application or service topology definition that can compile into existing resource profile,
dependency binding, runtime, route, and deployment planning concepts. Blueprint is not a Deployment,
not a Project, not a Resource, and not a Catalog Listing. The Community boundary is open,
file-first, and local-registry friendly; see
[ADR-065: Blueprint Format And Local Registry Boundary](./decisions/ADR-065-blueprint-format-and-local-registry-boundary.md).

Within a Blueprint, a Component is a deployable runtime unit. A Dependency Resource is a
service-like external, managed, imported, shared, or separately bound dependency requirement. A
`volume` requirement is storage intent, not a Dependency Resource; it compiles toward
`StorageVolume` plus `ResourceStorageAttachment`. A Component Relation is a directed link from a
consumer/dependent component to a provider/dependency component inside the same Blueprint
installation. It can describe endpoint consumption, lifecycle ordering, private service discovery,
network allowance, or telemetry attachment, but it does not create ownership and does not replace
dependency-resource binding. See
[ADR-078: Blueprint Component Relation Boundary](./decisions/ADR-078-blueprint-component-relation-boundary.md)
and
[ADR-083: Storage Volume, Dependency Resource, And Backup Boundary](./decisions/ADR-083-storage-volume-dependency-resource-and-backup-boundary.md).

## Core Principles

- aggregate boundaries follow invariants, not UI screens
- cross-aggregate references use IDs, not deep object graphs
- release and deployment are different concepts
- source version is a core value-object concept, not a Cloud extension; source profiles carry
  typed version references and deployment runtime plan snapshots carry fixed versions or `unknown`
- environment is a first-class domain object
- resource binding must remain an explicit domain concept
- storage volumes and resource storage attachments are explicit domain concepts; provider-native
  Docker/Compose/Swarm volume realization belongs behind runtime adapters and future deployment
  snapshot materialization
- mounted storage and service dependencies are different concepts. `StorageVolume` backup/restore
  must not be modeled as `DependencyResourceBackup`
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
- repository config may express non-secret control-plane connection policy. In self-hosted server
  config deploy it may also carry the narrow `controlPlane.deploymentContext` bootstrap/advanced
  override for project, environment, resource, server, and destination ids. It must not select
  credential, organization, tenant, provider account, token, database, or secret identity. Ordinary
  deployment context should still come from trusted entrypoint inputs, authenticated control-plane
  state, source fingerprint links, repository binding, deploy-token scope, adoption markers, or
  explicit relink/adoption operations.
- `controlPlane.install.database` is the database backend for installing Appaloft's own control
  plane. It is not an application dependency resource and must not be interpreted as a workload
  database declaration.
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
- future external edge access and DNS work is provider orchestration outside the selected
  deployment target, not Appaloft-owned CDN infrastructure and not a general DNS zone editor. The
  governed future model is recorded in
  [External Edge Access And DNS](./specs/075-external-edge-access-and-dns/spec.md). It must keep
  `DomainBinding` as the durable custom-domain owner, `DeploymentTarget` as the target-local edge
  proxy intent/readiness owner, deployment/runtime plan snapshots as immutable route history, and
  provider-specific DNS/proxy/cache/TLS/purge APIs behind concrete external edge provider packages.
  DNS mutation is allowed only for Appaloft-managed access records, verification records, and
  certificate-challenge records accepted by explicit workflows; arbitrary zone editing, unmanaged
  record deletion, hidden `deployments.create` DNS changes, provider raw payload exposure, edge
  compute, WAF/security-rule products, and Appaloft-operated CDN infrastructure are out of scope
  until separately governed.
- source fingerprint links map a normalized source identity to trusted project/environment/resource
  and optional target placement. They are not resource profile fields and must be changed only
  through explicit relink behavior, not by editing `appaloft.yml`.
- source fingerprint links are application state in the selected Appaloft state backend. File-backed
  SSH remote-state mirrors may move this state across a CLI process boundary, but
  PostgreSQL/PGlite backends must persist it through a dedicated persistence adapter rather than a
  `Resource` repository or resource aggregate field.

### Execution Sandbox

Owns:
- `Sandbox`
- `SandboxTemplate`
- `SandboxSnapshot`
- provider-neutral lifecycle, isolation, workspace, network, process, port, and snapshot intent

Accepted target model:
- `Sandbox` is a task-scoped isolated execution environment. It is not a `Deployment`,
  `Resource`, `DeploymentTarget`, terminal session, or AI-agent orchestration record.
- `SandboxTemplate` owns reusable admitted startup policy; `SandboxSnapshot` owns reusable captured
  state. Pause preserves one Sandbox identity, while snapshot creates an independent source for
  later Sandboxes.
- `SandboxProcess`, confined file entries, and port exposures are provider-observed runtime
  readbacks/capabilities rather than aggregate roots.
- public callers receive Appaloft ids and safe access descriptors. Host addresses, SSH access,
  provider credentials, host process ids, and resolved secret values never enter the published
  language.
- isolation is an explicit minimum and realized level (`container-trusted`, `gvisor`, `kata`, or
  `microvm`). Placement must fail closed when a provider cannot prove the requested level.
- workspace operations are confined below a provider-neutral root; traversal and symlink escape
  fail closed. Network access is default-deny or explicitly allowlisted.
- credential grants reference secrets plus allowed destinations and transformations. Resolution
  belongs to a credential broker port and plaintext must not appear in Sandbox state, output,
  errors, audit, or snapshots.
- lifecycle progression and provider effects are asynchronous, attempted, observable, idempotent,
  and reconciled. TTL and idle expiry use the same aggregate transition and exact owned-resource
  cleanup as explicit termination.
- Community, Cloud, Enterprise, Kubernetes, VPS, and third-party implementations translate behind
  provider ports; their topology, commercial policy, and vendor DTOs do not enter core.

Governing artifacts:
- [ADR-091](./decisions/ADR-091-execution-sandbox-boundary.md)
- [Execution Sandbox Platform](./specs/108-execution-sandbox-platform/spec.md)
- [Execution Sandbox Test Matrix](./testing/execution-sandbox-test-matrix.md)

### Sandbox Agent Runtime And Application Promotion

Owns:
- `SandboxAgentRuntime`
- `SandboxAgentRun`
- `SourceArtifact`
- `SandboxPromotion`
- harness-neutral execution, external capability approval, immutable workspace delivery and
  Sandbox-to-Resource delivery workflow

Accepted target model:
- `SandboxAgentRuntime` is addressable but lifecycle-subordinate to exactly one Sandbox. It is not a
  caller conversation or an Agent identity that can outlive the Sandbox.
- `SandboxAgentRun` owns one task lifecycle, explicit fresh/continue lineage, bounded redacted
  events, usage and terminal outcome. Runtime owns the one-active-Run admission claim.
- Agent harnesses are downstream adapters. Pi is the first adapter and never enters public aggregate
  state, errors or operation names.
- `SourceArtifact` is immutable, content-addressed application source with a safe manifest,
  provenance and opaque ArtifactStore reference. It is not a SandboxSnapshot or live workspace.
- `SandboxPromotion` owns plan, external acceptance and durable cross-context workflow state. It
  creates a new Resource, binds the exact artifact as `zip-artifact`, creates the first Deployment
  and completes only after `DeploymentProof.verdict = verified`.
- Runtime/Run events are data-plane execution facts. Audit is a separate control-plane governance
  projection. Domain Events do not become Billing Events without an explicit consumer policy.

Governing artifacts:
- [ADR-092](./decisions/ADR-092-sandbox-agent-runtime-and-application-promotion-boundary.md)
- [Spec 109](./specs/109-sandbox-agent-runtime-and-application-promotion/spec.md)
- [Test Matrix](./testing/sandbox-agent-runtime-and-application-promotion-test-matrix.md)

### Operator/Internal State

Owns:
- process attempt journal
- operator work read model
- durable process delivery state for accepted long-running work

Implemented now:
- process attempt journal read/write ports and persistence
- operator-work list/show visibility over process attempts and compatibility read models
- operator repair annotations for retry, cancel, dead-letter, mark-recovered, and prune
- selected durable worker bindings for scheduled-task runs, scheduled runtime prune, and scheduled
  history retention
- preview cleanup process-attempt projection for operator-visible cleanup success and retry
  failures
- proxy bootstrap process-attempt projection for operator-visible repair success and retriable
  failure details
- resource runtime-control process-attempt projection for operator-visible stop/start/restart
  success and failure details
- source-event auto-deploy process-attempt projection for operator-visible accepted dispatch,
  success, and failure details

Boundary rule:
- durable process delivery is Appaloft's outbox/inbox-equivalent baseline for accepted
  long-running work under
  [ADR-054](./decisions/ADR-054-durable-process-delivery-baseline.md)
- process attempt rows record operator-visible process state, retry eligibility, lineage, safe
  details, and terminal outcomes; they are not event-sourcing events and not business aggregate
  snapshots
- operation-specific workers may execute runtime/provider work only after a successful atomic
  delivery claim through application ports and persistence-owned claim/dedupe translation
- operator-work commands mutate only process attempt state unless a workflow-specific spec governs
  additional business-state mutation
- workflow-specific durable workers remain disabled by default unless their local spec/test matrix
  explicitly enables a shell runner; existing in-memory event consumers do not become durable
  automatically, and the certificate retry scheduler is the default-on maintenance exception
- preview cleanup retry scheduling uses process-attempt retry generation plus atomic
  claim/completion for worker handoff; preview cleanup attempt rows remain a compatibility
  cleanup-history read model
- proxy bootstrap repair execution still runs inline through `servers.bootstrap-proxy` and
  post-register bootstrap remains event-driven until a later local spec moves it to process-attempt
  atomic claim/completion
- resource runtime-control execution still runs inline through `resources.runtime.*` command use
  cases until a later local spec moves retry execution to process-attempt atomic claim/completion
- source-event auto-deploy dispatch still runs inline through `source-events.ingest` and the
  source-event record update path until a later local spec moves retry execution to
  process-attempt atomic claim/completion

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
- Repository config may express a prebuilt image source as user-facing application delivery intent,
  but the durable model remains the Resource source/runtime profile pair: `docker-image` source
  plus `prebuilt-image` runtime strategy. Registry credentials, pull secrets, and provider account
  identity are not repository config domain state.
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
  not leak into core aggregates. Runtime log archival is separate under ADR-053 and uses explicit
  Appaloft-owned archive snapshots derived from observation instead of persisting every live line by
  default.
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
- secret-classified Environment and Resource configuration values cross the application boundary
  through a versioned control-plane protection port. Persistence may store only protected envelopes;
  deployment planning and execution must authenticate and materialize the complete selected set
  before runtime mutation. Key rotation is a system operation over persistence records, not
  Environment, Resource, or Deployment aggregate behavior; it uses a dry-run digest, an external
  backup reference, and one atomic transaction so partial key states are never observable.
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

An active imported-external Dependency Resource may replace its Appaloft-stored connection
material through the explicit `dependency-resources.rotate-connection` operation. The transition
preserves resource identity, bindings and safe reference, updates masked endpoint metadata, and
does not mutate provider-native credentials or runtime state.

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
- Appaloft-managed Postgres and Redis include durable provider-native realization state and safe
  provider handles without moving provider SDK concerns into core
- the neutral dependency kind vocabulary recognizes `postgres`, `redis`, `mysql`, `clickhouse`,
  `object-storage`, and `opensearch` in core/read/contract surfaces. `object-storage` is the
  canonical control-plane kind; S3-compatible providers such as S3 and MinIO are provider aliases,
  not core kind names. Provider-native create/import operations remain explicitly scoped to
  Postgres and Redis until governed operations and adapters are introduced for the other kinds.
- provider-native realization and managed provider cleanup attempts are mirrored into
  operator-visible process-attempt state with safe dependency/provider metadata
- imported external Postgres delete removes only the Appaloft control-plane record and must not
  imply external database deletion
- connection read models expose only masked endpoint/connection metadata and secret references; raw
  passwords, tokens, auth headers, cookies, SSH credentials, provider tokens, private keys, and
  sensitive query parameters must not appear in list/show, events, errors, logs, or snapshots
- deletion is blocked by active/future ResourceBinding blockers, backup relationship metadata,
  provider-managed unsafe state, and future deployment snapshot/reference blockers
- binding readiness is a read-model summary; `resources.bind-dependency` must revalidate
  write-side Resource and Dependency Resource state
- repository config `dependencies` is an application dependency graph projection over existing
  dependency resource and binding operations. It may request managed Postgres and a runtime env
  binding such as `DATABASE_URL`, but it must not expose provider accounts, tenant identity,
  credentials, raw connection strings, database passwords, or internal ResourceInstance/
  ResourceBinding payloads.
- preview ephemeral dependency cleanup is authorized only by safe source-link provenance that names
  the repository-config dependency key, source fingerprint, Resource, binding, and dependency
  resource. Resource names or env target names alone are not ownership proof.

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
- Phase 7 dependency resource backup/restore baseline under
  [Dependency Resource Backup And Restore](./specs/039-dependency-resource-backup-restore/spec.md)
- Phase 7 dependency runtime injection and secret value resolution under
  [Dependency Binding Runtime Injection](./specs/047-dependency-binding-runtime-injection/spec.md)
  and
  [Dependency Runtime Secret Value Resolution](./specs/048-dependency-runtime-secret-value-resolution/spec.md)
- Phase 7 provider-native Redis realization under
  [Redis Provider-Native Realization](./specs/049-redis-provider-native-realization/spec.md)
- Repository config dependency graph under
  [Repository Config Dependency Graph](./specs/075-repository-config-dependency-graph/spec.md)
- provider-native Postgres and Redis realization/delete, backup/restore, runtime secret injection,
  Web management, and Postgres/Redis closed-loop verification are implemented through the Phase 7
  specs and dependency resource test matrix
- full process-attempt atomic claim/completion workers, provider-native credential rotation,
  scheduled backup policy, backup prune/delete, export/download, cross-resource restore, and
  dependency-resource runtime cleanup remain future governed slices

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
- backup/restore provider attempts are projected into operator-visible process attempts with safe
  dependency kind, provider, backup id, and restore attempt metadata; provider execution remains
  inline until a later local spec moves it to process-attempt atomic claim/completion
- raw dump contents, passwords, provider credentials, raw connection URLs, provider SDK payloads,
  and command output must not appear in core state, read models, events, errors, logs, or public
  contracts

Current scope:
- governed by
  [ADR-036: Dependency Resource Backup And Restore Lifecycle](./decisions/ADR-036-dependency-resource-backup-restore-lifecycle.md)
  and [Dependency Resource Backup And Restore](./specs/039-dependency-resource-backup-restore/spec.md)
- explicitly does not cover mounted SQLite/application files stored in `StorageVolume`; that
  storage-owned operation family is governed by
  [ADR-083](./decisions/ADR-083-storage-volume-dependency-resource-and-backup-boundary.md)
  and [Storage Volume Backup And Restore](./specs/098-storage-volume-backup-restore/spec.md)

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
  v1 single-server backend, Docker Swarm is the active v1 cluster backend, and Kubernetes remains a
  future orchestration backend behind the same `deployments.create` command.
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
- `DeploymentProof` is a read-only Release Orchestration result that compares one immutable
  Deployment plan with current sanitized artifact/runtime, Resource health/access, timeline, and
  recovery evidence. It is not Deployment aggregate state, a deployment mutation, or a replacement
  for the owning read models. Missing evidence cannot produce a `verified` verdict.
- deployments are displayed under the Resource that owns them; global or project-level deployment
  pages are read/query rollups
- deployment logs are attempt/progress records; application runtime logs are resource-owned
  observation and must not be treated as Deployment aggregate state. ADR-053 introduces planned
  runtime log archive snapshots as Appaloft-owned retained records outside Deployment aggregate
  state.
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
- `DeployToken`
- quota and billing policy

Implemented now:
- foundational `Organization`
- foundational `OrganizationMember`
- foundational `OrganizationPlan`
- foundational `DeployToken`

### Extensibility

Owns:
- `ProviderConnection`
- `IntegrationConnection`
- `PluginInstallation`

Accepted post-1.0 aggregate roots entering Code Round:
- `Sandbox`
- `SandboxTemplate`
- `SandboxSnapshot`

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
- `DeployToken`
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
- `SandboxRepository` persists only the `Sandbox` aggregate root
- `SandboxTemplateRepository` persists only the `SandboxTemplate` aggregate root
- `SandboxSnapshotRepository` persists only the `SandboxSnapshot` aggregate root
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
  Docker/Compose, active cluster orchestration such as Docker Swarm, or future cluster
  orchestration such as Kubernetes
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
  Docker Swarm is the active cluster runtime provider, while future cluster providers still require
  backend readiness and execution support before they are deployable

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

### Static Artifact Publication

Meaning:
- provider-neutral record that a prebuilt static artifact manifest has been stored and optionally
  routed for a Resource

Rules:
- static artifact manifests are content-addressed and must keep file count and byte totals
  consistent with their file digests
- publication storage references and route activations are adapter outputs, not hosted or provider
  strategy
- publication journal/read-model ports provide provider-neutral readback after publish
- payload readers translate a source path or staging area into manifest and file payloads before
  publication
- `static-artifacts.publish` is the public application command for server-local source-path direct
  static artifact publish intent; `appaloft static-artifacts publish <dist-or-zip>` packages local
  directories or `.zip` archives into portable payload/archive commands before CLI dispatch
- `POST /api/static-artifacts/publish` dispatches the same application command for authenticated
  API callers using a server-local source path and returns a provider-neutral publication DTO
- `POST /api/static-artifacts/publish-payload` dispatches inline base64 file payloads through
  `PublishStaticArtifactPayloadCommand` for Web, agent, or skill callers that have a prebuilt
  static artifact but no server-local source path
- `POST /api/static-artifacts/publish-archive` dispatches a base64 `.zip` archive through
  `PublishStaticArtifactArchiveCommand`, expanding safe archive entries into the same manifest and
  file payload model
- `GET /api/static-artifacts/publications` lists provider-neutral publication summaries through
  `StaticArtifactPublicationReadModelPort`
- public server/shell composition wires a local filesystem payload reader/store/route/publisher
  default; the payload reader accepts dist directories and server-local `.zip` archives, the local
  journal records publication summaries, and the public HTTP adapter serves immutable local artifact
  URLs from `dataDir/static-artifacts`
- `promoteAlias` on the local filesystem adapter records a current pointer for the project/resource
  and serves `/static-artifacts/projects/{projectId}/resources/{resourceId}/current/`
- direct static artifact publishing is separate from the existing static-server Docker/OCI
  deployment path

Current scope:
- public core value objects, application ports, application command, CLI/API source-path dispatch,
  inline JSON payload API dispatch, inline base64 zip archive API dispatch, local filesystem adapter
  with dist-directory and server-local `.zip` payload reading, public runtime composition, local
  publication readback, immutable local HTTP serving, and local alias/current serving
- public server runtime can publish a base64 zip archive through
  `POST /api/static-artifacts/publish-archive` and serve the promoted current URL locally
- no browser multipart upload, remote URL fetch upload, hosted provider implementation, hosted
  default-domain alias routing, billing, or abuse policy

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
- resource storage attachments belong to the Resource profile. Attach/detach affects deployment
  snapshot materialization only and does not apply mounts to current runtime state or rewrite
  historical deployment snapshots
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
- `named-volume` stores provider-neutral identity only; runtime adapters map deployment snapshot
  mount metadata to Docker/Compose/Swarm runtime storage realization during deployment execution
- `bind-mount` stores a trusted source path as adapter/runtime boundary data after strict path
  validation
- deletion is blocked while any active Resource attachment references the volume
- backup relationship metadata and StorageVolumeBackup records participate in delete/runtime cleanup
  safety
- storage volume lifecycle commands do not create deployments, provision provider-native volumes,
  run backup/restore, prune runtime state, or mutate historical deployment snapshots; storage
  backup/restore is exposed through the separate `storage-volumes.*backup*` command/query family
- deployment execution, not `storage-volumes.create`, is the default runtime realization point for
  storage mounts
- runtime volume cleanup belongs to the `storage-volumes.cleanup-runtime` command governed by
  [ADR-064: Storage Volume Runtime Realization And Cleanup](./decisions/ADR-064-storage-volume-runtime-realization-and-cleanup.md);
  it must not be hidden inside `storage-volumes.delete` or `servers.capacity.prune`
- storage backup/restore is a storage-owned operation family governed by
  [ADR-083: Storage Volume, Dependency Resource, And Backup Boundary](./decisions/ADR-083-storage-volume-dependency-resource-and-backup-boundary.md)
  and [Storage Volume Backup And Restore](./specs/098-storage-volume-backup-restore/spec.md).
  It must separate `BackupSourceAdapter` consistency from `BackupTargetProvider` artifact storage,
  default restore to a new volume, label local-only backup as not disaster recovery, and fail
  closed with blockers/errors when no safe source adapter or target provider is registered

Current scope:
- Phase 7 baseline aggregate implemented under
  [Storage Volume Lifecycle And Resource Attachment](./specs/032-storage-volume-lifecycle-and-resource-attachment/spec.md)
- feeds provider-neutral storage mount metadata into deployment snapshots and runtime adapters
- Resource overview mounted-storage visibility is governed by
  [Storage Volume Resource Visibility](./specs/096-storage-volume-resource-visibility/spec.md)
- public application-bundle storage binding readback is governed by
  [Application Bundle Storage Binding Boundary](./specs/097-application-bundle-storage-binding-boundary/spec.md)

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
- machine-readable `deployments.proof` comparison of the immutable plan with current bounded
  evidence, using `verified`, `partially-verified`, `unverified`, `stale`, and `failed`
- belongs to exactly one `Resource`
- carries both `destinationId` and `serverId`; `serverId` remains in persisted shape for transport
  compatibility and efficient target lookup
- owns execution-continuation and supersede runtime-cancellation questions; application guards and
  deployment use cases should ask `Deployment` instead of branching on raw deployment status values
- owns terminal attempt archive eligibility; archive is allowed only after terminal status and is
  separate from destructive retention prune

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
- runtime env injection is governed by ADR-040 and ADR-041; managed Redis binding requires
  provider-native Redis realization and a resolvable connection reference

### ResourceInstance

Meaning:
- provisioned dependency resource owned by system, organization, or project scope

Rules:
- a resource instance belongs to exactly one owner scope
- status transitions must remain monotonic from provisioning to ready or deleted

Current scope:
- foundational aggregate in `core`
- provider-backed provisioning orchestration is active for Appaloft-managed Postgres and Redis
  through injected provider capabilities and safe realization state
- concrete cloud provider package onboarding and provider-specific smoke tests remain release
  enablement work behind the same provider capability contracts

### Organization

Meaning:
- governance boundary for hosted control-plane and future tenant isolation

Rules:
- at least one owner must exist at creation time
- owner role changes use the dedicated ownership transfer operation; generic role update and
  remove-member operations must not change or remove owners
- plan changes cannot invalidate the current member count
- membership identity is owned by `OrganizationMember`; seat capacity is owned by
  `OrganizationPlan`; `Organization` coordinates those rules across its owned members and plan
- Phase 8 deploy-token authorization is organization-scoped. A deploy token is a machine credential
  for automation, not a Better Auth user session, and it must not be stored in repository config or
  deployment input.

Current scope:
- foundational aggregate in `core`
- identity provider integration is still future work
- deploy-token lifecycle and scoped authorization are active Phase 8 behavior under
  [ADR-043](./decisions/ADR-043-self-hosted-action-deploy-token-authorization.md) and
  [Self-Hosted Action Deploy Token Auth](./specs/052-self-hosted-action-deploy-token-auth/spec.md)
- post-bootstrap organization/team operations are active Phase 8 behavior under
  [ADR-045](./decisions/ADR-045-self-hosted-organization-team-operations.md) and
  [Self-Hosted Organization Team Operations](./specs/054-self-hosted-organization-team-operations/spec.md)

### DeployToken

Meaning:
- organization-owned machine credential metadata for trusted automation calling self-hosted Action
  mutation endpoints

Rules:
- raw token material is never part of the aggregate state; only verifier digest, safe secret suffix,
  lifecycle status, and safe scope metadata are modeled
- workflow-command scope must be non-empty
- revoked deploy tokens cannot be rotated or used for future Action authentication
- scope checks gate admission and may provide safe Action target-resolution facts; deployment,
  source-link, route, and preview cleanup business policy remains in the owning bounded contexts

Current scope:
- foundational aggregate in `core`
- persistence, installer one-time raw output, rotate/revoke operations, scoped Action
  authorization, and public CLI/API/Web token management entrypoints are active Phase 8 behavior;
  concrete future MCP descriptors remain a follow-up gap

### ProviderConnection / IntegrationConnection / PluginInstallation

Meaning:
- explicit ownership and lifecycle for external provider access, external integrations, and system/plugin installation state

Rules:
- every connection or installation belongs to one owner scope
- lifecycle state is explicit and not inferred from transport-only settings

Current scope:
- foundational aggregates in `core`
- application persistence and commands are still future work

### Sandbox / SandboxTemplate / SandboxSnapshot

Meaning:
- `Sandbox` owns one isolated task execution identity and desired lifecycle/policy
- `SandboxTemplate` owns reusable admitted startup defaults and override policy
- `SandboxSnapshot` owns independently reusable captured filesystem or memory-capable state

Rules:
- lifecycle transitions are intention-revealing and reject invalid or terminal-state mutations
- requested and realized isolation/capabilities remain distinct and observable
- a Sandbox may reference one Template, image, or Snapshot source without owning that source
- runtime processes, files, and port exposures remain provider capabilities/readbacks
- exact provider ownership handles are opaque to callers and cleanup never scans or deletes
  unrelated runtime state

Current scope:
- accepted post-1.0 Code Round under [ADR-091](./decisions/ADR-091-execution-sandbox-boundary.md)
- public operation, persistence, provider, SDK, CLI, and MCP implementation is governed by
  [Execution Sandbox Platform](./specs/108-execution-sandbox-platform/spec.md)

### SandboxAgentRuntime / SandboxAgentRun / SourceArtifact / SandboxPromotion

Meaning:
- `SandboxAgentRuntime` owns a stable harness-neutral runtime identity under one Sandbox
- `SandboxAgentRun` owns one submitted task, explicit lineage and observable terminal outcome
- `SourceArtifact` owns one immutable digest/manifest/provenance/store reference
- `SandboxPromotion` owns the exact plan/accept/workflow correlation through Deployment proof

Rules:
- a Runtime may claim at most one active Run and releases the claim only through a terminal transition
- Run context inheritance is explicit; caller conversation history is outside Appaloft ownership
- approval cannot be resolved by the harness or a Sandbox-scoped identity
- Source Artifact capture is safe-root confined and reference-protected after acceptance
- Promotion plan/accept binds artifact digest and explicit new Resource target
- partial failures retain Resource, artifact, Deployment attempt and evidence for retry/recovery

Current scope:
- accepted post-1.0 Code Round under [ADR-092](./decisions/ADR-092-sandbox-agent-runtime-and-application-promotion-boundary.md)
- implementation is governed by [Spec 109](./specs/109-sandbox-agent-runtime-and-application-promotion/spec.md)

## Current Implementation Mapping

These directories are authoritative for current domain code:

```text
packages/core/src/
  shared/
  workspace/
  configuration/
  runtime-topology/
  execution-sandbox/
  sandbox-agent-runtime/
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
- `execution-sandbox`: Sandbox, Template, Snapshot lifecycle and provider-neutral process,
  filesystem, network, port, isolation, and reconciliation capability boundaries
- `sandbox-agent-runtime`: Runtime/Run/approval lifecycle and harness anticorruption boundary;
  SourceArtifact and SandboxPromotion cross into workload-delivery/release-orchestration only
  through application commands/queries
- `release-orchestration`: deployment creation, listing, logs, rollback
- `extensibility`: providers, plugins, GitHub repository browsing, system diagnostics

## Naming Rules

- prefer domain names over implementation names
- prefer `DeploymentTarget` over `Server`
- prefer `Environment` over `EnvironmentProfile`
- use `Release` for immutable delivery snapshots
- use `Deployment` for runtime execution attempts

Compatibility aliases may exist temporarily, but new code and new docs should use the domain names.
