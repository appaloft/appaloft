# resources.create Implementation Plan

## Source Of Truth

This document is an implementation-planning contract for `resources.create`. It does not replace the command, event, error, workflow, or testing specs.

Implementation must preserve the source-of-truth behavior in the governed ADR and local specs before adding broader resource configuration features.

## Governed ADRs

- [ADR-011: Resource Create Minimum Lifecycle](../decisions/ADR-011-resource-create-minimum-lifecycle.md)
- [ADR-010: Quick Deploy Workflow Boundary](../decisions/ADR-010-quick-deploy-workflow-boundary.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)

## Governed Specs

- [resources.create Command Spec](../commands/resources.create.md)
- [resource-created Event Spec](../events/resource-created.md)
- [Resource Lifecycle Error Spec](../errors/resources.lifecycle.md)
- [Resource Create And First Deploy Workflow Spec](../workflows/resources.create-and-first-deploy.md)
- [resources.create Test Matrix](../testing/resources.create-test-matrix.md)
- [Quick Deploy Workflow Spec](../workflows/quick-deploy.md)
- [Quick Deploy Test Matrix](../testing/quick-deploy-test-matrix.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Touched Modules And Packages

Expected implementation scope:

- `packages/core/src/workload-delivery`: reuse `Resource`, `ResourceByEnvironmentAndSlugSpec`, `ResourceByIdSpec`, and `UpsertResourceSpec`; add `ResourceNetworkProfile` and network value-object rules when moving beyond the current runtime-profile compatibility field.
- `packages/application/src/operations/resources`: add or update `create-resource.schema.ts`, `create-resource.command.ts`, `create-resource.handler.ts`, and `create-resource.use-case.ts` to accept normalized source/runtime/network profile input.
- `packages/application/src/ports.ts` and `packages/application/src/tokens.ts`: reuse `ResourceRepository`, `ResourceReadModel`, `Clock`, `IdGenerator`, `EventBus`, and `AppLogger`; add tokens for create use case if missing.
- `packages/application/src/operation-catalog.ts`: add `resources.create`.
- `packages/application/src/resource-handlers.ts`, `resource-messages.ts`, and package exports: export the new command and handler consistently with existing resource query exports.
- `packages/orpc`: add typed `POST /api/resources` route using the application command schema and expose `orpcClient.resources.create`.
- `packages/contracts`: expose `CreateResourceInput` and `CreateResourceResponse` from application schemas or contract bridge without defining a parallel transport-only schema; map generic UI/CLI port wording to `networkProfile.internalPort`.
- `packages/adapters/cli`: add `yundu resource create` and update interactive deploy to use it in Code Round when Quick Deploy migration is in scope.
- `apps/web`: add owner-scoped resource create affordance and update Quick Deploy to call `resources.create` before `deployments.create(resourceId)` when implementation scope includes Web closure.
- `apps/shell`: register the use case, handler, and dependencies in the composition root.

## Expected Ports And Adapters

Required ports:

- `ResourceRepository`: load by id and by project/environment/slug; persist resource aggregate.
- `ResourceReadModel`: list resources after creation; future show query may use a dedicated read model method.
- `ProjectRepository`: verify project context.
- `EnvironmentRepository`: verify environment context and project ownership.
- `DestinationRepository`: verify optional default destination when provided.
- `IdGenerator`: create `resourceId`.
- `Clock`: create `createdAt`.
- `EventBus` or future outbox: publish or record `resource-created`.

Adapters must keep persistence and transport details outside `core`.

## Write-Side State Changes

The minimal write-side state change is creation of one `Resource` aggregate with:

- `id`;
- `projectId`;
- `environmentId`;
- optional `destinationId`;
- `name`;
- derived `slug`;
- `kind`;
- optional `description`;
- `services`;
- optional `sourceBinding`;
- optional `runtimeProfile`;
- optional `networkProfile`;
- `createdAt`.

No deployment, domain binding, certificate, environment variable, server, or destination state is mutated by `resources.create`.

No access-route profile, domain, or TLS policy is added to resource state in this plan.

`networkProfile` must hold the reusable workload endpoint state governed by [ADR-015](../decisions/ADR-015-resource-network-profile.md):

- `internalPort`;
- `upstreamProtocol`;
- `exposureMode`;
- optional `targetServiceName`;
- optional `hostPort` only for explicit direct-port exposure.

## Event Publishing Points

Required event publishing point:

- Publish or record `resource-created` after the `Resource` aggregate is durably persisted.

## Error And neverthrow Boundaries

Command factory returns `Result<CreateResourceCommand, DomainError>`.

Handler returns `Promise<Result<{ id: string }, DomainError>>`.

Use case returns `Promise<Result<{ id: string }, DomainError>>`.

Expected errors must use [Resource Lifecycle Error Spec](../errors/resources.lifecycle.md) and must not throw for validation, not found, conflict, mismatch, or aggregate invariant failures.

Repository or event publication failures before safe command success must return `err(DomainError)` with `code = infra_error`.

## Required Tests

Required tests:

- command schema validates required input, defaults `kind`, and rejects invalid kind/service shape;
- command schema or value-object validation accepts valid `networkProfile.internalPort` and rejects invalid or ambiguous network profile input;
- aggregate creates slug and emits `resource-created`;
- use case rejects missing project, missing environment, environment/project mismatch, missing destination, duplicate slug, and invalid multi-service declaration;
- use case persists resource and publishes event before returning `ok({ id })`;
- handler delegates to use case;
- read model lists the created resource;
- oRPC/HTTP route uses command schema and maps structured errors;
- CLI create command dispatches through `CommandBus`;
- Web create affordance dispatches typed client call and refreshes resource list/detail;
- Quick Deploy new-resource path calls `resources.create` before `deployments.create(resourceId)`;
- Quick Deploy auto-generated resource names include a short random suffix before `resources.create`;
- Quick Deploy maps a generic "port" field to `networkProfile.internalPort`;
- deployment bootstrap compatibility path remains covered until removed.

## Minimal Deliverable

The minimal Code Round deliverable is:

- `resources.create` command/schema/handler/use case;
- operation catalog and `CORE_OPERATIONS.md` implementation status update;
- typed API/oRPC route;
- CLI `yundu resource create`;
- Web owner-scoped create affordance sufficient for a user to create a resource without deploying;
- Quick Deploy migration for the new-resource path when Web/CLI closure is in scope;
- resource network profile persistence for first-deploy application listener port;
- read-model visibility through `resources.list`;
- tests for command admission, duplicate slug, structured errors, event emission, API/CLI dispatch, and Quick Deploy final payload.

`resources.show`, `resources.update`, `resources.archive`, source binding, health policy, resource env var management, domain/TLS management, static-site-specific config, and auto-deploy are follow-up behaviors.

Moving `source`, `sourceLocator`, `deploymentMethod`, command overrides, port, and health check path out of `deployments.create` is governed by [ADR-014](../decisions/ADR-014-deployment-admission-uses-resource-profile.md) and [ADR-015](../decisions/ADR-015-resource-network-profile.md). It is implemented by persisting source/runtime/network profile on `resources.create`.

Moving proxy, domain, path prefix, and TLS defaults out of `deployments.create` remains governed by [ADR-002](../decisions/ADR-002-routing-domain-tls-boundary.md) and the routing/domain/TLS command set.

Resource runtime profile implementation must use runtime plan strategy terminology. The existing CLI `--method` flag is an entry-workflow alias and must map to `RuntimePlanStrategy` before dispatching `resources.create`.

Resource network profile implementation must use `internalPort` terminology. Existing Web/CLI "port" labels are entry-workflow aliases and must map to `ResourceNetworkProfile.internalPort` before dispatching `resources.create`.

## Migration Seams And Legacy Edges

`deployments.create.resource` remains a compatibility path until Web QuickDeploy, CLI interactive deploy, deployment config bootstrap, and local/default deployment profiles are migrated or explicitly kept as bootstrap behavior.

Deployment config/default bootstrap may continue to create/reuse resources internally for local bootstrap profiles. That path must not become the public resource lifecycle contract.

Current aggregate event naming is `resource-created`.

Resource detail UI already exists as a read/detail surface over `resources.list`. Code Round should prefer adding owner-scoped create affordances that lead users to the resource detail page after creation.

## Current Implementation Notes And Migration Gaps

Current code has the `Resource` aggregate, repository, read model, PostgreSQL/PGlite persistence, `resources.list` query, CLI list command, oRPC list route, and Web resource detail page.

Current code has `resources.create` command/schema/handler/use case, operation catalog entry, create API route, CLI create command, Web project-page create affordance, Web Quick Deploy explicit-resource call path, CLI interactive deploy explicit-resource call path, shared Quick Deploy workflow sequencing for Web, and use-case tests.

Resource creation remains available through deployment bootstrap/default paths until those flows are explicitly removed or recast as first-class bootstrap behavior.

Current code persists and reads `networkProfile.internalPort` as the only resource listener-port field.

## Open Questions

- Exact operation names for resource source binding, runtime profile, network profile, and access profile configuration remain open under [ADR-012](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md) and [ADR-015](../decisions/ADR-015-resource-network-profile.md).
