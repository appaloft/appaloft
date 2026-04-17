# Current State Reverse Analysis

> Analysis date: 2026-04-13.
>
> Scope: repository scan only. No business implementation, tests, or config were changed while
> producing this document.

Legend:

- Confirmed: directly observed in code or existing docs.
- High-probability inference: strongly suggested by names, tests, or flow shape.
- Needs verification: not proven by the scan; keep as an open question.

## Current State Summary

Confirmed:

- Appaloft is a Bun monorepo with `apps/shell`, `apps/web`, and packages for `core`,
  `application`, `orpc`, `persistence/pg`, adapters, providers, integrations, plugins, and
  contracts.
- The business operation surface is documented in `docs/CORE_OPERATIONS.md` and mirrored in
  `packages/application/src/operation-catalog.ts`.
- The domain language is documented in `docs/DOMAIN_MODEL.md`; bounded-context implementation
  lives under `packages/core/src/{workspace,configuration,runtime-topology,workload-delivery,dependency-resources,release-orchestration,identity-governance,extensibility}`.
- `packages/application/src/operations/*` uses vertical slices such as
  `*.command.ts`, `*.query.ts`, `*.schema.ts`, `*.handler.ts`,
  `*.use-case.ts`, and `*.query-service.ts`.
- Command/query dispatch exists through `CommandBus` and `QueryBus`. Handlers are decorator
  registered via `@CommandHandler(...)` and `@QueryHandler(...)`.
- Domain events exist in `core` through `AggregateRoot.recordDomainEvent(...)` and a generic
  `DomainEvent` structure with `type`, `aggregateId`, `occurredAt`, and `payload`.
- Application event handling exists through `@EventHandler(eventType)`.
- The current shell event bus is in-memory and fire-and-forget. Handler errors are logged, not
  returned to the original command.
- `neverthrow` is centralized in `packages/core/src/shared/result.ts`; most domain/application
  expected failures return `Result<T, DomainError>`.
- `DeploymentProgressEvent` is a separate user-facing progress stream shape, not the same concept
  as domain events.
- `docs/PRODUCT_ROADMAP.md` identifies missing product capabilities around durable resource
  configuration, static site deployment, Git source binding, deployment show/stream, routing/TLS,
  env/secrets, storage, health policy, rollback retention, and webhooks.

High-probability inference:

- The codebase is partway through a transition from a demo-local deployment loop toward a durable
  PaaS-like resource lifecycle.
- The current `deployments.create` command is a transitional command that performs source
  detection, deployment-context bootstrap, runtime plan creation, deployment state progression, and
  execution in one synchronous application use case.
- Resource creation is currently implicit in deployment bootstrapping because `resources.create`
  and `resources.update` are not yet implemented.
- Web QuickDeploy and CLI interactive deploy are input collection workflows that sometimes create
  dependent records before submitting the final deployment command.

Needs verification:

- Whether production deployment execution will remain synchronous in-process or move to a durable
  async job/process-manager model.
- Whether domain events should be persisted through outbox/inbox before more automation is added.
- Which deployment status states will be required once deployment execution is decoupled from the
  command response.

## Key Findings

- The command/query surface is materially stronger than a typical half-formed CRUD app:
  `CORE_OPERATIONS.md`, `operation-catalog.ts`, command/query classes, schemas, handlers, and use
  cases are mostly aligned.
- The domain model already exposes bounded contexts and value-object-heavy aggregates, but some
  product roadmap concepts are only vocabulary today, not complete operation
  surfaces.
- The event model exists, but it is not yet specified like commands. It has generic payloads,
  string event names, an in-memory bus, and soft-failing async handlers.
- `deployments.create` is the main complexity hotspot. It is currently command-first, but it also
  owns detection, planning, state progression, runtime execution, event publication, and progress
  reporting in one use case.
- The current error model is structured enough for today but too coarse for future durable async
  processing.
- Tests already cover important deployment and proxy-bootstrap behavior, but they are not yet
  explicitly organized around command/event/error specs.

## Observed Concepts

Confirmed domain concepts:

- Workspace: `Project`, `Environment`
- Configuration: `EnvironmentConfigSet`, immutable `EnvironmentSnapshot`
- Runtime topology: `DeploymentTarget` with compatibility name `Server`, `Destination`,
  `SshCredential`, edge proxy intent/status
- Workload delivery: `Resource`, `Workload`, `SourceSpec`, `BuildSpec`, `RuntimeSpec`
- Dependency resources: `ResourceInstance`, `ResourceBinding`
- Release orchestration: `Deployment`, `Release`, `RuntimePlan`, `RollbackPlan`,
  `ExecutionResult`
- Extensibility: `ProviderConnection`, `IntegrationConnection`, `PluginInstallation`
- Identity/governance: foundational `Organization`, `OrganizationMember`, `OrganizationPlan`

Confirmed product roadmap gaps from current code:

- Durable resource create/show/update/archive is missing.
- Static site and buildpack terms exist in value objects/enums, but a complete static-artifact or
  Nixpacks runtime path is not implemented.
- Git source binding is per deployment today, not a durable resource-level source binding.
- Domain/TLS/routing hints are deployment/runtime-plan input today, not durable resource
  configuration.
- Resource-scoped env/secrets, storage, health policy, rollback retention, webhooks, preview
  deploys, and database provisioning remain incomplete or future work.

## Observed Commands And Queries

Confirmed commands:

- `projects.create`
- `servers.register`
- `servers.configure-credential`
- `servers.test-connectivity`
- `servers.test-draft-connectivity`
- `credentials.create-ssh`
- `environments.create`
- `environments.set-variable`
- `environments.unset-variable`
- `environments.promote`
- `deployments.create`
- `deployments.cancel`
- `deployments.check-health`
- `deployments.redeploy-resource`
- `deployments.reattach`
- `deployments.rollback`
- `system.db-migrate`

Confirmed queries:

- `projects.list`
- `servers.list`
- `credentials.list-ssh`
- `environments.list`
- `environments.show`
- `environments.diff`
- `resources.list`
- `deployments.list`
- `deployments.logs`
- `system.providers.list`
- `system.plugins.list`
- `system.github-repositories.list`
- `system.doctor`
- `system.db-status`

Confirmed write operations that enter through commands:

- CLI operation files build command/query messages and call `runCommand`, `runDeploymentCommand`,
  or `runQuery`.
- oRPC/OpenAPI procedures build command/query messages and dispatch through the buses.
- Web QuickDeploy uses the typed oRPC client for project/server/credential/environment/deployment
  operations.

Potential command bypass or boundary concerns:

- Web QuickDeploy performs local input validation with hardcoded thrown `Error` messages in a
  Svelte component before calling commands. That is acceptable for UI gating, but must not become
  business truth.
- CLI interactive deploy may create project/server/environment while collecting deployment input.
  That is command-based, but it is also a workflow with side effects before final deployment.
- `/api/health`, `/api/readiness`, and `/api/version` are deliberately infrastructure endpoints,
  not catalog business operations.

## Observed Events

Confirmed domain event types emitted by aggregates:

- `project.created`
- `environment.variable_set`
- `environment.variable_unset`
- `deployment_target.registered`
- `deployment_target.credential_configured`
- `deployment_target.edge_proxy_bootstrap_started`
- `deployment_target.edge_proxy_bootstrap_succeeded`
- `deployment_target.edge_proxy_bootstrap_failed`
- `destination.registered`
- `ssh_credential.created`
- `resource.created`
- `workload.declared`
- `resource.instance_created`
- `resource.instance_ready`
- `resource.instance_deleted`
- `resource.binding_created`
- `release.prepared`
- `release.sealed`
- `deployment.planning_started`
- `deployment.planned`
- `deployment.started`
- `deployment.canceled`
- `deployment.finished`
- `provider_connection.created`
- `provider_connection.activated`
- `integration_connection.created`
- `integration_connection.connected`
- `integration_connection.revoked`
- `plugin_installation.installed`
- `plugin_installation.disabled`
- `plugin_installation.incompatible`
- `organization.created`
- `organization.member_added`
- `organization.plan_changed`

Confirmed event consumer:

- `BootstrapServerEdgeProxyOnTargetRegisteredHandler` consumes
  `deployment_target.registered`, starts edge proxy bootstrap when proxy kind is not `none`, and
  records ready/failed status back on the deployment target.

Event model gaps:

- Event types are string literals with generic payloads; there are no per-event payload value
  types or specs yet.
- The event bus has no durable outbox/inbox, dedupe key, correlation id, causation id, retry
  policy, dead-letter policy, or handler-status read model.
- There is no central event catalog equivalent to `operation-catalog.ts`.
- Event handler failure is logged and soft-fails; this is intentional for current proxy bootstrap,
  but it must be specified because callers cannot infer success from the original command result.

## Observed Async Behaviors

Confirmed:

- Domain event handlers are dispatched in a `Promise.resolve().then(...)` loop by the shell
  `InMemoryEventBus`, so event side effects run asynchronously relative to publication.
- Server registration persists server metadata and publishes `deployment_target.registered`.
  Proxy bootstrap happens later through the event handler, and failure is stored on
  `edgeProxy.status`, `lastErrorCode`, and `lastErrorMessage`.
- Deployment progress streaming uses `DeploymentProgressReporter` and
  `DeploymentProgressObserver`, plus oRPC `createStream` and HTTP SSE support. This is an adapter
  progress stream, not durable event sourcing.
- `deployments.create` currently performs detect, plan, persist, start, execute, persist final
  status, and event publication inside the command use case.
- Deployment status state machine currently supports `created -> planning -> planned -> running`
  then terminal `succeeded`, `failed`, `canceled`, or `rolled-back`.
- Runtime adapters attach retryability information to `ExecutionResult` and persist it through
  deployment logs/runtime metadata when execution finishes.

High-probability inference:

- `deployments.create` is synchronous from the command caller perspective today, even though it
  reports progress and emits domain events along the way.
- Server proxy bootstrap is the clearest current example of an async state progression that should
  receive a formal event/workflow spec before more background behavior is added.

Async gaps:

- There is no durable job state for deployment execution; a lost process cannot resume execution.
- `deployments.reattach` returns persisted status/logs but explicitly does not resume lost work.
- No outbox/inbox or durable event-handler result records exist.
- Retry policy is present as data on execution failures but not yet a first-class process-manager
  behavior.

## Observed Error Model And neverthrow Use

Confirmed:

- `DomainError` currently has `code`, `category`, `message`, `retryable`, and optional `details`.
- Error categories are `user`, `infra`, `provider`, and `retryable`.
- Error factories include `validation`, `invariant`, `notFound`, `conflict`,
  `deploymentNotRedeployable`, `infra`, `provider`, and `retryable`.
- Command/query handlers and use cases generally return `Promise<Result<...>>`.
- oRPC maps domain errors to HTTP-like ORPC errors by `code` and `category`.
- CLI converts `Result` failures into Effect failures and prints structured error output.

Gaps:

- Error structure has no explicit `phase`, `step`, `commandName`, `eventName`, `correlationId`,
  `causationId`, `relatedEntityId`, or `retryAfter`.
- Multiple logical categories are collapsed into current broad categories. For example validation,
  permission, async processing, timeout, and external dependency are not explicit top-level
  categories.
- Some adapter/UI code still throws `Error` for boundary behavior. This is acceptable at adapter
  boundaries but should be converted to structured errors before crossing business boundaries.
- Web QuickDeploy currently uses hardcoded user-facing thrown messages in Svelte. That is an i18n
  and specification drift risk.

## Observed Testing Style

Confirmed:

- Core unit tests focus on aggregates/value objects such as environment/resource/runtime plan.
- Application tests cover `CreateDeploymentUseCase`, deployment snapshot, default context
  bootstrap, resource bootstrap, cancel/reattach, force redeploy, and server edge proxy bootstrap.
- Persistence integration tests cover Kysely/Postgres/PGlite repositories and read models.
- Runtime adapter tests cover proxy bootstrap/labels and runtime plan resolver behavior.
- Shell E2E tests cover CLI + HTTP flows including migration, doctor, create project/server/env,
  set/show/diff/promote env vars, deploy, logs, rollback, provider/plugin listing, and invalid
  deployment input.
- Web has API/client and webview/e2e coverage.

Testing gaps:

- Tests are behavior-oriented in places, but command/event/error specs are not yet the organizing
  source of truth.
- Event flow tests exist for server proxy bootstrap, but there is no reusable event spec matrix.
- Async failure/retry/idempotency coverage is narrow.
- Error assertions sometimes check text presence, e.g. CLI invalid deployment expects
  `validation_error`; the desired future is stable error code/type/phase assertions everywhere.
- There is no explicit test matrix linking `deployments.create` branches to source kinds,
  deployment methods, missing parameters, async status, and runtime failures.

## Smells To Track

Architecture smells:

- `deployments.create` is doing too much for the long-term model: context bootstrap, detection,
  snapshot, plan, execution, status progression, and progress reporting.
- `resources.list` exists without first-class resource create/show/update/archive operations; deploy
  bootstrapping is carrying resource lifecycle responsibilities.
- Durable source/build/routing/resource configuration is still spread across deployment input,
  runtime plan hints, and UI/CLI workflows.

Modeling smells:

- `Server` compatibility naming still leaks around runtime topology. The domain term is
  `DeploymentTarget`.
- Event payloads are not typed and not cataloged.
- Some product roadmap concepts exist as enums/value objects but not as
  complete commands, aggregates, or adapters.

Async smells:

- Event handling is async and soft-failing but not durable or observable as first-class process
  state.
- Deployment execution has progress streaming but not durable job orchestration.
- Proxy bootstrap can fail after server registration succeeds; this is correct but must be visible
  in specs and read models.

Error smells:

- `DomainError` is structured but too coarse for async/process-manager work.
- UI and adapter boundary exceptions can obscure structured error semantics.
- Retryability exists but is not consistently attached to a named phase/step.

Testing smells:

- Existing tests are useful but do not yet trace back to command/event/error spec documents.
- Async retry/idempotency and durable process-failure tests are not yet systematic.
