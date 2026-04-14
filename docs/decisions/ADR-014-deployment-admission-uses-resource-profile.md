# ADR-014: Deployment Admission Uses Resource Profile

Status: Accepted

Date: 2026-04-14

## Decision

`deployments.create` must admit deployment attempts from existing domain identities and must not accept reusable source, runtime, health, route, domain, or TLS configuration as public command input.

The public deployment admission input is limited to deployment context references:

- `projectId`;
- `environmentId`;
- `resourceId`;
- `serverId`;
- optional `destinationId` when the caller knows the target destination.

The deployment use case must load the `Resource` aggregate and resolve the deployment attempt snapshot from the resource-owned profile:

- `ResourceSourceBinding` provides the source locator and source identity;
- `ResourceRuntimeProfile` provides the runtime plan strategy, command defaults, and health-check defaults;
- `ResourceNetworkProfile` provides the internal workload listener port, upstream protocol, exposure mode, and service target needed for runtime/proxy planning;
- `Deployment` persists only the immutable resolved runtime plan snapshot and environment snapshot for the accepted attempt.

Command success still means request accepted and returns `ok({ id })`. It does not mean execution, verification, routing, or health has completed.

## Context

The previous transitional deployment command shape accepted `sourceLocator`, `source`, `deploymentMethod`, command overrides, port, health path, proxy, domain, path prefix, and TLS fields. That shape was useful while Quick Deploy created resources implicitly, but it blurred the Resource/Deployment boundary and made deployment admission look like the durable owner of reusable resource configuration.

The product workflow now treats Project as a collection of Resources, and Deployment as a resource-owned attempt/history item. Quick Deploy remains an input collection workflow over explicit commands, not a separate domain command.

## Options Considered

### Option A: Keep Transitional Deployment Override Fields

This preserves current callers but keeps source/runtime/domain language on `deployments.create`.

This option is rejected for new implementation work.

### Option B: Move Source And Runtime Profile To Resource, Keep Domain/TLS On Deployment

This improves build/runtime ownership but keeps durable route/domain/TLS lifecycle mixed into deployment admission.

This option is rejected because ADR-002 already governs durable routing/domain/TLS as separate domain-binding and certificate commands.

### Option C: Make Resource Profile The Deployment Planning Source

This makes deployment admission consume existing resource profile state and persist only snapshots on the deployment attempt.

This option is accepted.

## Chosen Rule

`resources.create` may accept source and runtime profile input when the caller is creating the resource specifically for a first deploy workflow.

`resources.create` may persist:

- resource identity and ownership;
- optional default destination reference;
- optional `ResourceSourceBinding`;
- optional `ResourceRuntimeProfile`;
- optional `ResourceNetworkProfile`.

`deployments.create` must not accept:

- `resource` creation input;
- `sourceLocator`;
- `source`;
- `deploymentMethod`;
- `installCommand`;
- `buildCommand`;
- `startCommand`;
- `port`;
- `healthCheckPath`;
- `internalPort`;
- `hostPort`;
- `exposureMode`;
- `upstreamProtocol`;
- `proxyKind`;
- `domains`;
- `pathPrefix`;
- `tlsMode`.

`deploymentMethod` must not be used as the domain term in new resource-side contracts. The domain term is `RuntimePlanStrategy`.

The use case may use `SourceDetector` against the resource source binding locator when detection enriches the resolved `SourceDescriptor`, but the locator still belongs to the resource profile, not to the deployment command.

If a resource lacks a source binding and no legacy migration seam is explicitly in scope, `deployments.create` must reject admission with `validation_error` in phase `resource-source-resolution`.

If a resource needs inbound traffic and lacks a resolvable `ResourceNetworkProfile.internalPort`, `deployments.create` must reject admission with `validation_error` in phase `resource-network-resolution`.

`destinationId` may be omitted only when a compatibility seam can resolve or create the server's default destination before deployment context validation. New API and automation callers should prefer passing an explicit `destinationId` or creating a resource with a default destination.

## Consequences

Deployment API, CLI, and Web callers must create or select a resource before dispatching deployment admission.

Quick Deploy must perform input collection in this order:

```text
collect source/runtime/network draft
  -> create or select project
  -> create or select environment
  -> create or select server
  -> create or select resource with source/runtime/network profile
  -> deployments.create(projectId, environmentId, resourceId, serverId, destinationId?)
```

Deployment history, new deployment, and redeploy affordances belong on the resource surface. Project pages may expose resource lists and Quick Deploy entrypoints, but they must not imply deployments are project-owned.

Existing deployments remain valid because their runtime and network plan snapshots already record the attempt state. Existing resources without source/runtime/network profile require a migration path or profile configuration before strict redeploy can be fully reliable.

## Governed Specs

- [resources.create Command Spec](../commands/resources.create.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [Quick Deploy Workflow Spec](../workflows/quick-deploy.md)
- [Resource Create And First Deploy Workflow Spec](../workflows/resources.create-and-first-deploy.md)
- [Deployments Create Error Spec](../errors/deployments.create.md)
- [Deployments Create Test Matrix](../testing/deployments.create-test-matrix.md)
- [resources.create Implementation Plan](../implementation/resources.create-plan.md)
- [ADR-015: Resource Network Profile](./ADR-015-resource-network-profile.md)

## Superseded Open Questions

- Should `deployments.create` keep source/runtime/route override fields during implementation?
- Should `resources.create` remain profile-only after Quick Deploy needs a first-deploy source/runtime/network profile?
- Should a deployment command own `sourceLocator` or should the use case resolve source from the resource?
- Should the internal application listener port belong to deployment admission, generic runtime profile state, or a resource-owned network profile?

## Current Implementation Notes And Migration Gaps

Current command/schema/API/CLI/Web deployment admission paths are migrated to ids-only `deployments.create` for the new resource-profile flow.

Historical resources may still lack source/runtime/network profile values and need profile backfill or an explicit configuration step before strict redeploy is reliable.

Existing deployment config bootstrap can still create or infer deployment context and must be narrowed to a compatibility seam.

Current code still stores `port` under `ResourceRuntimeProfile`. [ADR-015](./ADR-015-resource-network-profile.md) governs the migration to `ResourceNetworkProfile.internalPort`.

## Open Questions

- None.
