# Gap Analysis And Gradual Correction Route

> Analysis date: 2026-04-13.
>
> Source basis: current code scan plus `docs/PRODUCT_ROADMAP.md`.

## High Priority Gaps

### Missing durable resource lifecycle

Current code:

- `resources.list` is implemented.
- Deployment creation can bootstrap a resource from `CreateDeploymentCommandInput.resource`.
- The product roadmap marks resource create/show/update/archive as P0.

Gap:

- Resource source, build, routing, health, storage, env, and lifecycle configuration do not have a
  durable command surface yet.

Short-term correction:

- Add command specs before implementation for `resources.create`, `resources.show`,
  `resources.update`, and `resources.archive`.
- Keep deployment bootstrap behavior documented as transitional.
- Add tests proving a deployment can use an existing resource and bootstrap only when explicitly
  allowed by deployment-context policy.

Long-term target:

- `deployments.create` consumes a durable resource/source/build/routing config rather than carrying
  all configuration as deployment input.

### Deployment command mixes orchestration and execution

Current code:

- `CreateDeploymentUseCase` performs context bootstrap, source detection, snapshot creation, plan
  resolution, deployment creation, state progression, persistence, event publication, runtime
  execution, and final persistence.

Gap:

- This is acceptable for the current local-first system, but it will not scale to durable async
  execution, retries, and resume after process loss.

Short-term correction:

- Write `deployments.create` command spec that explicitly states current synchronous execution.
- Add an async behavior section describing future split into accepted/planned/running/succeeded or
  failed states.
- Add tests that document current behavior and failure classes.

Long-term target:

- Split plan creation and execution when durable async processing is introduced.
- Consider `deployments.plan`, `deployments.start`, and a deployment process manager only when
  state durability and operational needs justify the split.

### Event model lacks durable processing semantics

Current code:

- Aggregates record domain events.
- Application publishes pulled events.
- Shell `InMemoryEventBus` dispatches handlers asynchronously and logs failures.
- Only one confirmed event handler currently consumes `deployment_target.registered`.

Gap:

- No event catalog, typed payload specs, outbox/inbox, dedupe, retry, dead-letter, correlation id,
  causation id, or handler status read model.

Short-term correction:

- Add event specs for `deployment_target.registered` and
  `deployment_target.edge_proxy_bootstrap_*`.
- Mark current event bus as non-durable.
- Add tests for repeated event handling and failed bootstrap state persistence.

Long-term target:

- Introduce outbox/inbox only when background workflows need durability. Do not add it as ceremony
  before concrete async workflows require it.

### Error model too coarse for async workflows

Current code:

- `DomainError` has stable code/category/retryable and details.
- Error categories are broad: `user`, `infra`, `provider`, `retryable`.
- Runtime execution results can store `errorCode` and `retryable`.

Gap:

- Error phase/step, command/event name, correlation/causation id, retryAfter, related entity, and
  async processing semantics are missing.

Short-term correction:

- Add error spec template and error catalog.
- Require every new command spec to list sync vs async failures.
- Start adding `details.phase` and `details.step` in new async-related errors before changing the
  entire `DomainError` shape.

Long-term target:

- Evolve `DomainError` into a richer structured union only after a few specs prove the fields are
  stable.

### Web QuickDeploy contains workflow logic and hardcoded errors

Current code:

- Web QuickDeploy uses oRPC client operations and TanStack Query.
- It also throws hardcoded user-facing messages inside the Svelte component before calling
  commands.

Gap:

- UI validation can drift from command schema/business errors.
- Hardcoded Svelte messages violate the repo rule that user-facing web copy should use i18n keys.

Short-term correction:

- Document Web QuickDeploy as a workflow, not domain logic.
- Move only stable user-facing messages to i18n in a future UI-only change.
- Do not move workflow branching into `core`.

Long-term target:

- Keep the Web flow as input collection and preview. Final command semantics remain in command
  specs and operation schemas.

## Medium Priority Gaps

### Deploy source binding is not durable

Current code:

- `CreateDeploymentCommandInput` accepts `sourceLocator` and optional `source` descriptor.
- Redeploy uses latest deployment state.

Gap:

- Git/source binding is not persisted as a resource-level configuration.

Correction:

- Add resource source binding spec as part of the resource lifecycle milestone.
- Keep redeploy-from-latest-deployment as transitional compatibility until resource binding exists.

### Deployment progress stream is not domain event flow

Current code:

- `DeploymentProgressEvent` is emitted by `DeploymentProgressReporter` and streamed over oRPC/SSE.

Gap:

- Progress events can be mistaken for domain events or durable process state.

Correction:

- Document it as a technical/progress-stream event.
- Add durable `deployments.show` and `deployments.stream-events` specs only when backed by
  persisted state or a clear stream contract.

### Compatibility naming remains mixed

Current code:

- Domain term is `DeploymentTarget`; CLI/HTTP still use `server`.

Gap:

- Docs and specs can drift if they silently use both terms.

Correction:

- In new specs, write `DeploymentTarget (transport-compatible name: server)`.
- Avoid introducing new domain files that use `Server` as aggregate language.

## Low Priority Gaps

- Foundational aggregates such as `Workload`, `ResourceBinding`, `ResourceInstance`, `Release`,
  `ProviderConnection`, `IntegrationConnection`, and `PluginInstallation` already emit events, but
  they are not all public workflows yet. Do not over-spec them until a feature consumes them.
- Full service-template marketplace, browser terminal, GPU tuning, and multi-node scheduling are
  product-depth items from the product roadmap. They should not block resource lifecycle and
  static-site deployment.

## Recommended Route

Phase 1:

- Keep implementation unchanged.
- Add command/event/error/testing templates.
- Add lightweight specs for `deployments.create` and server edge proxy bootstrap.
- Add an error catalog skeleton.
- Add tests only after specs identify the branch being locked down.

Phase 2:

- Add durable resource command specs, then implement `resources.create/show/update/archive`.
- Add resource source binding and routing/TLS configuration as durable resource config.
- Make `deployments.create` prefer resource configuration and keep inline deployment hints as
  compatibility.

Phase 3:

- Introduce durable async process state for deployments only after current synchronous deployment
  limits become operationally painful.
- Add event outbox/inbox and retry policies when event consumers become business-critical.
- Split progress stream, durable event stream, and domain event processing into separate specs and
  code paths.

## Human Confirmation Needed

- Whether `deployments.create` should remain a synchronous command in near-term self-hosted mode or
  become an async accepted job for all entrypoints.
- Whether resource configuration should become mandatory before deploy, or whether deployment
  bootstrap remains a supported shortcut.
- Which source types are P0 for the next milestone: static site, Dockerfile, Compose, prebuilt
  image, or GitHub App source binding.
- Whether server edge proxy bootstrap failure should ever block `servers.register`, or whether the
  current soft-fail behavior is intentional product semantics.
